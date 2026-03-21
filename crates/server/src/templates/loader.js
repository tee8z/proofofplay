// Initialize WASM modules, then load the bundled app JS
import initNostr, { NostrClientWrapper, SignerType, encryptNsecWithPassword, decryptNsecWithPassword } from '/ui/pkg/nostr_signer/nostr_signer.js';
import initGameEngine, { GameEngine, InputRecorder } from '/ui/pkg/game_engine/game_engine.js';

async function initApp() {
    console.log('Loading WASM modules...');

    // Initialize both WASM modules in parallel
    await Promise.all([
        initNostr(),
        initGameEngine(),
    ]);
    console.log('WASM modules loaded');

    // Make WASM classes available globally
    window.NostrClientWrapper = NostrClientWrapper;
    window.SignerType = SignerType;
    window.GameEngine = GameEngine;
    window.InputRecorder = InputRecorder;
    window.encryptNsecWithPassword = encryptNsecWithPassword;
    window.decryptNsecWithPassword = decryptNsecWithPassword;

    // Set API_BASE from body data attribute
    const apiBase = document.body.getAttribute('data-api-base') || '';
    window.API_BASE = apiBase;

    // Default relays for NIP-07 extension auth (configurable via server config)
    const relaysAttr = document.body.getAttribute('data-default-relays') || '';
    window.DEFAULT_RELAYS = relaysAttr ? relaysAttr.split(',').filter(Boolean) : [];

    // Load the bundled app JS
    const script = document.createElement('script');
    script.src = '/static/app.min.js';
    document.body.appendChild(script);
}

initApp().catch(console.error);
