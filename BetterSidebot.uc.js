// ==UserScript==
// @name           BetterSidebot
// @version        2.0.0
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

    // Raccourci clavier : Alt+K
    const SHORTCUT_KEY        = 'K';
    const SHORTCUT_MODIFIERS  = 'alt';

    // Les 13 chatbots — l'ordre = l'ordre d'affichage dans le bandeau
    const CHATBOTS = [
        { id: 'perplexity', name: 'Perplexity',  url: 'https://www.perplexity.ai',   icon: 'perplexity.png' },
        { id: 'gemini',     name: 'Gemini',      url: 'https://aistudio.google.com',  icon: 'gemini.png' },
        { id: 'claude',     name: 'Claude',      url: 'https://claude.ai',            icon: 'claude.png' },
        { id: 'chatgpt',    name: 'ChatGPT',     url: 'https://chatgpt.com',          icon: 'chatgpt.png' },
        { id: 'grok',       name: 'Grok',        url: 'https://grok.com',             icon: 'grok.png' },
        { id: 'metaai',     name: 'Meta AI',     url: 'https://meta.ai',              icon: 'metaai.png' },
        { id: 'kimi',       name: 'Kimi',        url: 'https://kimi.com',             icon: 'kimi.png' },
        { id: 'deepseek',   name: 'DeepSeek',    url: 'https://chat.deepseek.com',    icon: 'deepseek.png' },
        { id: 'qwen',       name: 'Qwen',        url: 'https://chat.qwen.ai',         icon: 'qwen.png' },
        { id: 'zai',        name: 'Z.AI',        url: 'https://z.ai',                 icon: 'zai.png' },
        { id: 'lechat',     name: 'Le Chat',     url: 'https://chat.mistral.ai',      icon: 'LeChat.png' },
        { id: 'lumo',       name: 'Lumo',        url: 'https://lumo.proton.me',       icon: 'lumo.png' },
        { id: 'lmarena',    name: 'LMArena',     url: 'https://lmarena.ai',           icon: 'LMArena.png' },
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

            // 3. Injecter le dock flottant (bottom-center)
            this.createDock();

            // 4. Observer la pref zen.urlbar.behavior pour show/hide le dock
            this.observeUrlbarPref();

            // 5. Enregistrer le raccourci clavier
            this.registerShortcut();

            // 6. Marquer le bot actif
            this.markActiveBot();

            // 7. Observer les changements de pref (si changés via about:config)
            this.observeProviderPref();

            // 8. Observer les changements de sidebarcommand (chat ↔ extensions)
            this.observeSidebarCommand();

            this.log('initialized ✅ v2.0 — ' + CHATBOTS.length + ' bots ready');
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

            // Forcer le chargement du browser sidebar après un court délai
            // (au démarrage, le browser peut ne pas se charger automatiquement)
            setTimeout(() => {
                const sidebarBrowser = document.getElementById('sidebar');
                if (sidebarBrowser) {
                    sidebarBrowser.reload();
                    this.log('sidebar browser reloaded after un-hide');
                }
            }, 1500);

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
        // Alt+K = raccourci universel adaptatif :
        // - Mode chat → CSS toggle (préserve le browser en vie)
        // - Mode native, sidebar ouverte → fermeture native
        // - Sidebar fermée → reopen avec le dernier chatbot
        toggleSidebar() {
            const box = document.getElementById('sidebar-box');
            const isChat = box?.getAttribute('sidebarcommand') === 'viewGenaiChatSidebar';
            const controller = window.SidebarController;

            if (isChat) {
                // Mode chat → CSS toggle (préserve le browser en vie)
                const isVisible = document.documentElement.getAttribute('chat-sidebar-visible') === 'true';
                if (isVisible) this.hideSidebar();
                else            this.showSidebar();
            } else if (controller?.isOpen) {
                // Mode native, sidebar ouverte → fermeture native
                this.log('native sidebar hide (non-chat mode)');
                controller.hide();
            } else if (controller) {
                // Sidebar fermée → rouvrir le DERNIER panel utilisé (chat ou autre)
                const lastCmd = this._lastCommand || 'viewGenaiChatSidebar';
                this.log('reopening last sidebar panel: ' + lastCmd);
                controller.show(lastCmd).then(() => {
                    // Si c'était le chat → appliquer notre visibilité CSS
                    if (lastCmd === 'viewGenaiChatSidebar') {
                        this.showSidebar();
                        this.markActiveBot();
                    }
                }).catch(e => this.log('⚠️ reopen failed: ' + e.message));
            } else {
                this.log('⚠️ no SidebarController available');
            }
        },

        // ═══════════════════════════════════════════════
        // DOCK FLOTTANT (bottom-center, show/hide via pref URLBar-2.0)
        // ═══════════════════════════════════════════════

        // ── createDock ───────────────────────────────────
        // Crée le dock horizontal (bottom-center) et l'injecte dans #browser
        // Show/hide contrôlé par l'attribut HTML chat-dock-visible
        // (défini par observeUrlbarPref qui écoute zen.urlbar.behavior)
        createDock() {
            if (document.getElementById('chat-dock-wrapper')) return;

            const browserEl = document.getElementById('browser');
            if (!browserEl) {
                this.log('#browser not found, retrying...');
                setTimeout(() => this.createDock(), 500);
                return;
            }

            const dock = document.createXULElement('hbox');
            dock.id = 'chat-dock-wrapper';

            for (const bot of CHATBOTS) {
                const btn = document.createXULElement('toolbarbutton');
                btn.classList.add('chatbot-btn');
                btn.setAttribute('data-bot-id', bot.id);
                btn.setAttribute('tooltiptext', bot.name);

                const img = document.createXULElement('image');
                img.setAttribute('src', iconUrl(bot.icon));
                btn.appendChild(img);

                // ── 3 handlers unifiés sur mousedown ──
                // Left → foreground, Middle → background, Right → sidebar
                const PRINCIPAL = Services.scriptSecurityManager.getSystemPrincipal();
                btn.addEventListener('mousedown', (e) => {
                    if (e.button === 0) {
                        // Left click → onglet foreground
                        const tab = gBrowser.addTab(bot.url, { triggeringPrincipal: PRINCIPAL });
                        gBrowser.selectedTab = tab;
                    } else if (e.button === 1) {
                        // Middle click → onglet background
                        e.preventDefault();
                        gBrowser.addTab(bot.url, { triggeringPrincipal: PRINCIPAL });
                    } else if (e.button === 2) {
                        // Right click → sidebar chatbot
                        e.preventDefault();
                        this.switchTo(bot);
                    }
                });

                // Bloquer le context menu natif (right-click)
                btn.addEventListener('contextmenu', (e) => e.preventDefault());

                dock.appendChild(btn);
            }

            browserEl.appendChild(dock);
            this.log('dock injected — ' + CHATBOTS.length + ' buttons');
        },

        // ── observeUrlbarPref ────────────────────────────
        // Pont avec URLBar-2.0 : écoute zen.urlbar.behavior
        // floating-on-type → dock visible / normal → dock caché
        observeUrlbarPref() {
            const self = this;
            const observer = {
                observe(subject, topic, data) {
                    if (topic !== 'nsPref:changed' || data !== 'zen.urlbar.behavior') return;
                    const val = Services.prefs.getStringPref('zen.urlbar.behavior', 'normal');
                    const visible = val === 'floating-on-type';
                    document.documentElement.setAttribute(
                        'chat-dock-visible', visible ? 'true' : 'false'
                    );
                    if (visible) self.markActiveBot();
                },
            };
            Services.prefs.addObserver('zen.urlbar.behavior', observer);
            this.log('observeUrlbarPref actif (dock lié à zen.urlbar.behavior)');
        },

        // ═══════════════════════════════════════════════
        // SWITCH
        // ═══════════════════════════════════════════════

        // ── switchTo ─────────────────────────────────────
        // Change la pref + restore le sidebar chat si nécessaire + reload + affiche
        // Utilise SidebarController.show() pour restaurer proprement le browser chat
        // quand une extension (ColorTrip, etc.) a pris le sidebar.
        async switchTo(bot) {
            this.log('switching to: ' + bot.name + ' (' + bot.url + ')');

            // 1. Changer la pref officielle Firefox (AVANT tout pour que chat.html la lise)
            Services.prefs.setStringPref(PREF_PROVIDER, bot.url);

            const box = document.getElementById('sidebar-box');
            const isChatCommand = box?.getAttribute('sidebarcommand') === 'viewGenaiChatSidebar';

            if (isChatCommand) {
                // Déjà sur le chat → reload pour charger le nouveau provider
                const sidebarBrowser = document.getElementById('sidebar');
                if (sidebarBrowser) {
                    sidebarBrowser.reload();
                } else {
                    this.log('⚠️ #sidebar browser not found!');
                }
            } else if (window.SidebarController?.show) {
                // Pas sur le chat → SidebarController.show() charge chat.html frais
                // qui lira la pref provider qu'on vient de définir
                this.log('restoring chat sidebar via SidebarController.show()');
                try {
                    await window.SidebarController.show('viewGenaiChatSidebar');
                } catch (e) {
                    this.log('⚠️ SidebarController.show() failed: ' + e.message);
                    // Fallback manuel
                    box.setAttribute('sidebarcommand', 'viewGenaiChatSidebar');
                    const sb = document.getElementById('sidebar');
                    if (sb) sb.src = 'chrome://browser/content/genai/chat.html';
                }
            } else {
                // Fallback sans SidebarController
                this.log('fallback: manual sidebarcommand + src');
                box.setAttribute('sidebarcommand', 'viewGenaiChatSidebar');
                const sb = document.getElementById('sidebar');
                if (sb) sb.src = 'chrome://browser/content/genai/chat.html';
            }

            // 2. Marquer le bouton actif
            this.markActiveBot(bot.id);

            // 3. Afficher la sidebar (CSS show)
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
            if (window.__BetterSidebotShortcut) return;
            window.__BetterSidebotShortcut = true;

            document.addEventListener('keydown', (e) => {
                if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleSidebar();
                }
            });

            this.log('shortcut registered: Alt+K (keydown listener)');
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

        // ═══════════════════════════════════════════════
        // SIDEBAR COMMAND OBSERVER
        // ═══════════════════════════════════════════════

        // ── observeSidebarCommand ───────────────────────
        // MutationObserver sur sidebarcommand de #sidebar-box.
        // Détecte quand une extension (ColorTrip, etc.) prend la sidebar
        // ou quand on revient au chat. Pose l'attribut sidebar-mode pour le CSS.
        // Zero polling : ne se déclenche QUE quand sidebarcommand change.
        observeSidebarCommand() {
            const box = document.getElementById('sidebar-box');
            if (!box) {
                this.log('#sidebar-box not found for observer, retrying...');
                setTimeout(() => this.observeSidebarCommand(), 1000);
                return;
            }

            const update = () => {
                const cmd = box.getAttribute('sidebarcommand');
                const isChat = cmd === 'viewGenaiChatSidebar';

                // Mémoriser le dernier command non-vide (pour le reopen d'Alt+K)
                if (cmd) {
                    this._lastCommand = cmd;
                }

                // Pose l'attribut sidebar-mode pour le CSS
                document.documentElement.setAttribute('sidebar-mode', isChat ? 'chat' : 'native');

                // Si on quitte le mode chat → retirer notre masquage CSS
                // pour que le nouveau contenu (ColorTrip, bookmarks, etc.) soit visible
                if (!isChat) {
                    document.documentElement.removeAttribute('chat-sidebar-visible');
                }

                this.log('sidebar-mode → ' + (isChat ? 'chat' : 'native') + ' (command: ' + cmd + ')');
            };

            // Observer UNIQUEMENT l'attribut sidebarcommand — zero polling
            const observer = new MutationObserver(update);
            observer.observe(box, {
                attributes: true,
                attributeFilter: ['sidebarcommand']
            });

            // État initial
            update();

            this.log('observeSidebarCommand actif (MutationObserver sur sidebarcommand)');
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
