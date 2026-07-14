// ==UserScript==
// @name           BetterSidebot
// @version        1.0.0
// @description    Bandeau flottant pour switcher entre tous tes chatbots dans la sidebar Zen
// @author         Impre
// @include        main
// ==/UserScript==

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════
    // CONFIG
    // ═══════════════════════════════════════════════════

    const PREF_PROVIDER = 'browser.ml.chat.provider';
    const PREF_VISIBLE  = 'extensions.zen.bettersidebot.visible';

    // Raccourci clavier : Ctrl+Shift+B
    const SHORTCUT_KEY        = 'B';
    const SHORTCUT_MODIFIERS  = 'accel shift';

    // Les 13 chatbots — l'ordre = l'ordre d'affichage dans le bandeau
    const CHATBOTS = [
        { id: 'perplexity', name: 'Perplexity',  url: 'https://www.perplexity.ai',   icon: 'perplexity.png' },
        { id: 'chatgpt',    name: 'ChatGPT',     url: 'https://chatgpt.com',          icon: 'chatgpt.png' },
        { id: 'claude',     name: 'Claude',      url: 'https://claude.ai',            icon: 'claude.png' },
        { id: 'gemini',     name: 'Gemini',      url: 'https://aistudio.google.com',  icon: 'gemini.png' },
        { id: 'deepseek',   name: 'DeepSeek',    url: 'https://chat.deepseek.com',    icon: 'deepseek.png' },
        { id: 'grok',       name: 'Grok',        url: 'https://grok.com',             icon: 'grok.png' },
        { id: 'kimi',       name: 'Kimi',        url: 'https://kimi.com',             icon: 'kimi.png' },
        { id: 'qwen',       name: 'Qwen',        url: 'https://chat.qwen.ai',         icon: 'qwen.png' },
        { id: 'lechat',     name: 'Le Chat',     url: 'https://chat.mistral.ai',      icon: 'LeChat.png' },
        { id: 'metaai',     name: 'Meta AI',     url: 'https://meta.ai',              icon: 'metaai.png' },
        { id: 'lmarena',    name: 'LMArena',     url: 'https://lmarena.ai',           icon: 'LMArena.png' },
        { id: 'zai',        name: 'Z.AI',        url: 'https://z.ai',                 icon: 'zai.png' },
        { id: 'lumo',       name: 'Lumo',        url: 'https://lumo.proton.me',       icon: 'lumo.png' },
    ];

    const ICONS_DIR = PathUtils.join(PathUtils.profileDir, 'chrome', 'sine-mods', 'BetterSidebot', 'icons');

    function iconUrl(filename) {
        const path = PathUtils.join(ICONS_DIR, filename);
        return 'file:///' + encodeURI(path.replace(/\\/g, '/'));
    }

    // ═══════════════════════════════════════════════════
    // BetterSidebot
    // ═══════════════════════════════════════════════════

    const BetterSidebot = {
        log(msg) {
            console.log('%c[BetterSidebot]', 'color:#00ff88;font-weight:bold', msg);
        },

        init() {
            if (window.__BetterSidebotInit) return;
            if (!window.gBrowser || !gBrowser.tabContainer) {
                setTimeout(() => this.init(), 500);
                return;
            }
            window.__BetterSidebotInit = true;

            // 1. Restaurer l'état persistant AVANT de garantir la sidebar
            this.restoreState();

            // 2. Garantir que la sidebar chat est en vie (retirer hidden natif)
            this.ensureSidebarLoaded();

            // 3. Injecter le bandeau flottant + zone hover
            this.createBandeau();

            // 4. Enregistrer le raccourci clavier
            this.registerShortcut();

            // 5. Marquer le bot actif
            this.markActiveBot();

            // 6. Observer les changements de pref (si changés via about:config)
            this.observeProviderPref();

            this.log('initialized ✅ — ' + CHATBOTS.length + ' bots ready');
        },

        // ═══════════════════════════════════════════════
        // SIDEBAR LIFECYCLE
        // ═══════════════════════════════════════════════

        // ── ensureSidebarLoaded ──────────────────────────
        // Retire l'attribut hidden natif de Zen sur #sidebar-box.
        // Notre CSS prend le relais avec display:none pour masquer
        // visuellement tout en gardant le <browser> en vie.
        ensureSidebarLoaded() {
            const box = document.getElementById('sidebar-box');
            if (!box) {
                this.log('#sidebar-box not found, retrying...');
                setTimeout(() => this.ensureSidebarLoaded(), 1000);
                return;
            }

            // S'assurer que la commande chat est configurée
            if (box.getAttribute('sidebarcommand') !== 'viewGenaiChatSidebar') {
                box.setAttribute('sidebarcommand', 'viewGenaiChatSidebar');
            }

            // Retirer le hidden natif de Zen
            // → le <browser> peut charger chat.html en arrière-plan
            // → notre CSS display:none le masque visuellement
            box.hidden = false;
            box.removeAttribute('hidden');

            this.log('sidebar-box un-hidden — browser stays loaded');
        },

        // ── restoreState ─────────────────────────────────
        // Au démarrage, lire la pref persistante et appliquer l'attribut
        restoreState() {
            const visible = Services.prefs.getBoolPref(PREF_VISIBLE, false);
            document.documentElement.setAttribute('chat-sidebar-visible', visible ? 'true' : 'false');
            this.log('restored state: ' + (visible ? 'visible' : 'hidden'));
        },

        // ── showSidebar ──────────────────────────────────
        showSidebar() {
            document.documentElement.setAttribute('chat-sidebar-visible', 'true');
            Services.prefs.setBoolPref(PREF_VISIBLE, true);
            this.log('sidebar shown');
        },

        // ── hideSidebar ──────────────────────────────────
        hideSidebar() {
            document.documentElement.setAttribute('chat-sidebar-visible', 'false');
            Services.prefs.setBoolPref(PREF_VISIBLE, false);
            this.log('sidebar hidden');
        },

        // ── toggleSidebar ────────────────────────────────
        toggleSidebar() {
            const isVisible = document.documentElement.getAttribute('chat-sidebar-visible') === 'true';
            if (isVisible) this.hideSidebar();
            else            this.showSidebar();
        },

        // ═══════════════════════════════════════════════
        // BANDEAU
        // ═══════════════════════════════════════════════

        // ── createBandeau ────────────────────────────────
        // Crée le bandeau flottant + zone hover et les injecte dans #browser
        createBandeau() {
            // Éviter double injection
            if (document.getElementById('chat-dock-wrapper')) return;

            const browser = document.getElementById('browser');
            if (!browser) {
                this.log('#browser not found, retrying...');
                setTimeout(() => this.createBandeau(), 500);
                return;
            }

            // Container wrapper (position:absolute parent)
            const wrapper = document.createXULElement('hbox');
            wrapper.id = 'chat-dock-wrapper';

            // Zone hover invisible (3px bord gauche)
            const hoverZone = document.createXULElement('box');
            hoverZone.id = 'chat-hover-zone';

            // Bandeau de boutons
            const switcher = document.createXULElement('vbox');
            switcher.id = 'chatbot-switcher';

            // Créer un bouton par chatbot
            for (const bot of CHATBOTS) {
                const btn = document.createXULElement('toolbarbutton');
                btn.classList.add('chatbot-btn');
                btn.setAttribute('data-bot-id', bot.id);
                btn.setAttribute('tooltiptext', bot.name);

                const img = document.createXULElement('image');
                img.setAttribute('src', iconUrl(bot.icon));
                btn.appendChild(img);

                btn.addEventListener('click', () => {
                    this.switchTo(bot);
                });

                switcher.appendChild(btn);
            }

            // Ordre important : hoverZone AVANT switcher pour le sélecteur CSS ~
            wrapper.appendChild(hoverZone);
            wrapper.appendChild(switcher);
            browser.appendChild(wrapper);

            this.log('bandeau injected — ' + CHATBOTS.length + ' buttons');
        },

        // ═══════════════════════════════════════════════
        // SWITCH
        // ═══════════════════════════════════════════════

        // ── switchTo ─────────────────────────────────────
        // Change la pref + reload la sidebar + marque actif + affiche sidebar
        switchTo(bot) {
            this.log('switching to: ' + bot.name + ' (' + bot.url + ')');

            // 1. Changer la pref officielle Firefox
            Services.prefs.setStringPref(PREF_PROVIDER, bot.url);

            // 2. Reload le browser sidebar pour charger le nouveau chatbot
            const sidebarBrowser = document.getElementById('sidebar');
            if (sidebarBrowser) {
                sidebarBrowser.reload();
            } else {
                this.log('⚠️ #sidebar browser not found!');
            }

            // 3. Marquer le bouton actif
            this.markActiveBot(bot.id);

            // 4. Afficher la sidebar
            this.showSidebar();
        },

        // ── markActiveBot ────────────────────────────────
        // Highlight le bouton correspondant à la pref actuelle
        markActiveBot(explicitId) {
            let botId = explicitId;

            if (!botId) {
                // Déduire depuis la pref — match sur le hostname
                const currentUrl = Services.prefs.getStringPref(PREF_PROVIDER, '');
                if (currentUrl) {
                    try {
                        const uri = Services.io.newURI(currentUrl);
                        const host = uri.host;
                        const bot = CHATBOTS.find(b => {
                            try {
                                return Services.io.newURI(b.url).host === host;
                            } catch { return false; }
                        });
                        botId = bot ? bot.id : null;
                    } catch {
                        // URL invalide, fallback sur include
                        const bot = CHATBOTS.find(b => currentUrl.includes(b.url.replace(/^https?:\/\//, '')));
                        botId = bot ? bot.id : null;
                    }
                }
            }

            const buttons = document.querySelectorAll('.chatbot-btn');
            buttons.forEach(btn => {
                if (btn.getAttribute('data-bot-id') === botId) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            if (botId) this.log('active bot: ' + botId);
        },

        // ═══════════════════════════════════════════════
        // RACCOURCI CLAVIER
        // ═══════════════════════════════════════════════

        // ── registerShortcut ─────────────────────────────
        // Crée un <key> dans #zenKeyset
        registerShortcut() {
            const keyset = document.getElementById('zenKeyset');
            if (!keyset) {
                this.log('#zenKeyset not found, retrying...');
                setTimeout(() => this.registerShortcut(), 1000);
                return;
            }

            // Éviter double enregistrement
            if (document.getElementById('bettersidebot-toggle-key')) return;

            const key = document.createXULElement('key');
            key.id = 'bettersidebot-toggle-key';
            key.setAttribute('modifiers', SHORTCUT_MODIFIERS);
            key.setAttribute('key', SHORTCUT_KEY);
            key.setAttribute('oncommand', 'void 0');
            key.addEventListener('command', () => this.toggleSidebar());
            keyset.appendChild(key);

            this.log('shortcut registered: Ctrl+Shift+' + SHORTCUT_KEY);
        },

        // ═══════════════════════════════════════════════
        // PREF OBSERVER
        // ═══════════════════════════════════════════════

        // ── observeProviderPref ──────────────────────────
        // Si la pref change (via about:config ou autre), mettre à jour le highlight
        observeProviderPref() {
            const observer = {
                observe: (subject, topic, data) => {
                    if (topic === 'nsPref:changed' && data === PREF_PROVIDER) {
                        this.log('provider pref changed externally');
                        this.markActiveBot();
                    }
                }
            };
            Services.prefs.addObserver(PREF_PROVIDER, observer);
        },
    };

    // ═══════════════════════════════════════════════════
    // BOOT
    // ═══════════════════════════════════════════════════

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        BetterSidebot.init();
    } else {
        document.addEventListener('DOMContentLoaded', () => BetterSidebot.init(), { once: true });
    }
})();
