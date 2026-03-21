// Auth client for Nostr-based authentication
// Depends on WASM NostrClientWrapper and SignerType being available on window

class AuthClient {
    constructor(apiBase) {
        this.apiBase = apiBase;
        this.nostrClient = null;
        this.sessionId = null;
        this.username = null;
    }

    async initialize() {
        try {
            this.nostrClient = new window.NostrClientWrapper();
            this.restoreSession();
            this.setupEventListeners();
            console.log("Auth client initialized");
        } catch (error) {
            console.error("Failed to initialize auth client:", error);
        }
    }

    setupEventListeners() {
        // Login related elements
        const loginBtn = document.getElementById("loginBtn");
        if (loginBtn) loginBtn.addEventListener("click", () => this.showLoginModal());

        const closeLoginModal = document.getElementById("closeLoginModal");
        if (closeLoginModal) closeLoginModal.addEventListener("click", () => this.hideLoginModal());

        const loginButton = document.getElementById("loginButton");
        if (loginButton) loginButton.addEventListener("click", () => this.handlePrivateKeyLogin());

        const usernameLoginButton = document.getElementById("usernameLoginButton");
        if (usernameLoginButton) usernameLoginButton.addEventListener("click", () => this.handleUsernameLogin());

        const extensionLoginButton = document.getElementById("extensionLoginButton");
        if (extensionLoginButton) extensionLoginButton.addEventListener("click", () => this.handleExtensionLogin());

        const showRegisterModal = document.getElementById("showRegisterModal");
        if (showRegisterModal) {
            showRegisterModal.addEventListener("click", (e) => {
                e.preventDefault();
                this.hideLoginModal();
                this.showRegisterModal();
            });
        }

        // Registration related elements
        const registerBtn = document.getElementById("registerBtn");
        if (registerBtn) registerBtn.addEventListener("click", () => this.showRegisterModal());

        const closeRegisterModal = document.getElementById("closeRegisterModal");
        if (closeRegisterModal) closeRegisterModal.addEventListener("click", () => this.hideRegisterModal());

        const registerStep1Button = document.getElementById("registerStep1Button");
        if (registerStep1Button) registerStep1Button.addEventListener("click", () => this.handleRegistrationComplete());

        const usernameRegisterButton = document.getElementById("usernameRegisterButton");
        if (usernameRegisterButton) usernameRegisterButton.addEventListener("click", () => this.handleUsernameRegister());

        const extensionRegisterButton = document.getElementById("extensionRegisterButton");
        if (extensionRegisterButton) extensionRegisterButton.addEventListener("click", () => this.handleExtensionRegistration());

        const copyRecoveryKey = document.getElementById("copyRecoveryKey");
        if (copyRecoveryKey) copyRecoveryKey.addEventListener("click", () => this.handleCopyRecoveryKey());


        const usernameRegisterComplete = document.getElementById("usernameRegisterComplete");
        if (usernameRegisterComplete) {
            usernameRegisterComplete.addEventListener("click", async () => {
                try {
                    await this.login("username");

                    // Save lightning address if provided during registration
                    const lnInput = document.getElementById("registerLightningAddress");
                    if (lnInput && lnInput.value.trim()) {
                        try {
                            const apiBase = window.API_BASE || document.body.getAttribute("data-api-base") || "";
                            await this.post(`${apiBase}/api/v1/users/lightning-address`, {
                                lightning_address: lnInput.value.trim(),
                            });
                            localStorage.setItem("lightningAddress", lnInput.value.trim());
                        } catch (lnErr) {
                            console.warn("Failed to save lightning address during registration:", lnErr);
                        }
                    }

                    this.hideRegisterModal();
                } catch (error) {
                    console.error("Failed to complete registration login:", error);
                }
            });
        }

        const showLoginModal = document.getElementById("showLoginModal");
        if (showLoginModal) {
            showLoginModal.addEventListener("click", (e) => {
                e.preventDefault();
                this.hideRegisterModal();
                this.showLoginModal();
            });
        }

        // How to Play modal
        const howToPlayBtn = document.getElementById("howToPlayBtn");
        const howToPlayModal = document.getElementById("howToPlayModal");
        const closeHowToPlay = document.getElementById("closeHowToPlay");
        if (howToPlayBtn && howToPlayModal) {
            howToPlayBtn.addEventListener("click", () => howToPlayModal.classList.add("is-active"));
        }
        if (closeHowToPlay && howToPlayModal) {
            closeHowToPlay.addEventListener("click", () => howToPlayModal.classList.remove("is-active"));
        }

        // Tip modal
        const tipLink = document.querySelector(".tip-link");
        const tipModal = document.getElementById("tipModal");
        const closeTipModal = document.getElementById("closeTipModal");
        if (tipLink && tipModal) {
            tipLink.addEventListener("click", function() {
                tipModal.classList.add("is-active");
            });
        }
        if (closeTipModal && tipModal) {
            closeTipModal.addEventListener("click", function() {
                tipModal.classList.remove("is-active");
            });
        }

        // Tip preset buttons
        document.querySelectorAll(".tip-preset").forEach(function(btn) {
            btn.addEventListener("click", function() {
                const input = document.getElementById("tipAmountInput");
                if (input) input.value = btn.getAttribute("data-amount");
            });
        });

        // Copy tip address
        const tipCopyAddrBtn = document.getElementById("tipCopyAddressBtn");
        if (tipCopyAddrBtn) {
            tipCopyAddrBtn.addEventListener("click", function() {
                const addrEl = document.getElementById("tipAddressDisplay");
                if (addrEl) {
                    navigator.clipboard.writeText(addrEl.textContent.trim()).then(function() {
                        const copied = document.getElementById("tipAddressCopied");
                        if (copied) {
                            copied.style.display = "inline";
                            setTimeout(function() { copied.style.display = "none"; }, 2000);
                        }
                    }).catch(function() {});
                }
            });
        }

        // Generate tip invoice
        const tipSendBtn = document.getElementById("tipSendBtn");
        if (tipSendBtn) {
            tipSendBtn.addEventListener("click", async function() {
                const input = document.getElementById("tipAmountInput");
                const amount = parseInt(input && input.value, 10);
                if (!amount || amount < 1) {
                    if (input) input.focus();
                    return;
                }

                tipSendBtn.disabled = true;
                tipSendBtn.textContent = "Loading...";

                try {
                    const apiBase = window.API_BASE || "";
                    const resp = await fetch(apiBase + "/api/v1/payments/tip", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ amount_sats: amount }),
                    });

                    if (!resp.ok) {
                        const errText = await resp.text();
                        throw new Error(errText);
                    }

                    const data = await resp.json();

                    // Show invoice step
                    const addressStep = document.getElementById("tipAddressStep");
                    const invoiceStep = document.getElementById("tipInvoiceStep");
                    if (addressStep) addressStep.style.display = "none";
                    if (invoiceStep) invoiceStep.style.display = "block";

                    // QR code
                    const qrContainer = document.getElementById("tipQrContainer");
                    if (qrContainer) {
                        qrContainer.innerHTML = "";
                        const qrSize = Math.min(250, window.innerWidth - 100);
                        const qrEl = document.createElement("bitcoin-qr");
                        qrEl.setAttribute("lightning", data.invoice);
                        qrEl.setAttribute("width", qrSize);
                        qrEl.setAttribute("height", qrSize);
                        qrEl.setAttribute("dots-type", "rounded");
                        qrEl.setAttribute("corners-square-type", "extra-rounded");
                        qrEl.setAttribute("background-color", "#ffffff");
                        qrEl.setAttribute("dots-color", "#000000");
                        qrContainer.appendChild(qrEl);
                    }

                    const invoiceInput = document.getElementById("tipInvoiceInput");
                    if (invoiceInput) invoiceInput.value = data.invoice;

                    const status = document.getElementById("tipStatus");
                    if (status) {
                        status.textContent = "Scan with your wallet to send " + amount + " sats";
                        status.className = "nes-text is-success";
                        status.style.display = "block";
                    }

                    tryLightningUri(data.invoice);


                } catch (e) {
                    const status = document.getElementById("tipStatus");
                    if (status) {
                        status.textContent = "Error: " + e.message;
                        status.className = "nes-text is-error";
                        status.style.display = "block";
                    }
                } finally {
                    tipSendBtn.disabled = false;
                    tipSendBtn.textContent = "Generate Invoice";
                }
            });
        }

        // Copy tip invoice
        const tipCopyBtn = document.getElementById("tipCopyInvoiceBtn");
        if (tipCopyBtn) {
            tipCopyBtn.addEventListener("click", function() {
                const invoiceInput = document.getElementById("tipInvoiceInput");
                if (invoiceInput && invoiceInput.value) {
                    navigator.clipboard.writeText(invoiceInput.value).then(function() {
                        const copied = document.getElementById("tipInvoiceCopied");
                        if (copied) {
                            copied.style.display = "inline";
                            setTimeout(function() { copied.style.display = "none"; }, 2000);
                        }
                    }).catch(function() {});
                }
            });
        }

        // Tip back button
        const tipBackBtn = document.getElementById("tipBackBtn");
        if (tipBackBtn) {
            tipBackBtn.addEventListener("click", function() {
                var addressStep = document.getElementById("tipAddressStep");
                var invoiceStep = document.getElementById("tipInvoiceStep");
                if (addressStep) addressStep.style.display = "block";
                if (invoiceStep) invoiceStep.style.display = "none";
            });
        }

        // Logout
        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) logoutBtn.addEventListener("click", () => this.handleLogout());

        // Start screen buttons
        const startLoginBtn = document.getElementById("startLoginBtn");
        if (startLoginBtn) startLoginBtn.addEventListener("click", () => this.showLoginModal());

        const startRegisterBtn = document.getElementById("startRegisterBtn");
        if (startRegisterBtn) startRegisterBtn.addEventListener("click", () => this.showRegisterModal());

        // Tab switching
        document.querySelectorAll(".tab").forEach((tab) => {
            tab.addEventListener("click", () => {
                const parent = tab.parentElement;
                const modal = parent.closest(".modal");
                if (!modal) return;

                parent.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
                tab.classList.add("is-active");

                modal.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("is-active"));

                const targetId = tab.dataset.target;
                const target = document.getElementById(targetId);
                if (target) target.classList.add("is-active");
            });
        });
    }

    showLoginModal() {
        console.log("Showing login modal");
        const modal = document.getElementById("loginModal");
        if (modal) modal.classList.add("is-active");
    }

    hideLoginModal() {
        const modal = document.getElementById("loginModal");
        if (modal) modal.classList.remove("is-active");
        // Clear recovery key + password fields
        const keyInput = document.getElementById("loginPrivateKey");
        if (keyInput) keyInput.value = "";
        const recoveryNewPw = document.getElementById("recoveryNewPassword");
        if (recoveryNewPw) recoveryNewPw.value = "";
        const recoveryConfirmPw = document.getElementById("recoveryConfirmPassword");
        if (recoveryConfirmPw) recoveryConfirmPw.value = "";
        // Clear username/password fields
        const loginUsername = document.getElementById("loginUsername");
        if (loginUsername) loginUsername.value = "";
        const loginPassword = document.getElementById("loginPassword");
        if (loginPassword) loginPassword.value = "";
        // Clear errors
        const keyError = document.getElementById("privateKeyError");
        if (keyError) keyError.textContent = "";
        const usernameError = document.getElementById("usernameLoginError");
        if (usernameError) usernameError.textContent = "";
        const extError = document.getElementById("extensionLoginError");
        if (extError) extError.textContent = "";
    }

    showRegisterModal() {
        console.log("Showing register modal");
        // Reset to step 1
        const step1 = document.getElementById("usernameRegisterStep1");
        if (step1) step1.classList.remove("is-hidden");
        const step2 = document.getElementById("usernameRegisterStep2");
        if (step2) step2.classList.add("is-hidden");

        const modal = document.getElementById("registerModal");
        if (modal) modal.classList.add("is-active");
    }

    hideRegisterModal() {
        const modal = document.getElementById("registerModal");
        if (modal) modal.classList.remove("is-active");
        const extError = document.getElementById("extensionRegisterError");
        if (extError) extError.textContent = "";
    }

    async handleRegisterInit() {
        try {
            await this.nostrClient.initialize(window.SignerType.PrivateKey, null);
            const privateKeyDisplay = document.getElementById("privateKeyDisplay");
            if (privateKeyDisplay) {
                privateKeyDisplay.value = await this.nostrClient.getPrivateKey();
            }

            const step1 = document.getElementById("registerStep1");
            if (step1) step1.classList.remove("is-hidden");
            const step2 = document.getElementById("registerStep2");
            if (step2) step2.classList.add("is-hidden");
            const step1Btn = document.getElementById("registerStep1Button");
            if (step1Btn) step1Btn.disabled = true;
            const checkbox = document.getElementById("privateKeySavedCheckbox");
            if (checkbox) checkbox.checked = false;
        } catch (error) {
            console.error("Failed to generate private key:", error);
        }
    }

    async handleCopyRecoveryKey() {
        const recoveryKeyDisplay = document.getElementById("recoveryKeyDisplay");
        if (!recoveryKeyDisplay) return;

        this.copyToClipboard(recoveryKeyDisplay.value);

        const copyBtn = document.getElementById("copyRecoveryKey");
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = "Copied!";
            setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
        }
    }

    copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => this.fallbackCopy(text));
        } else {
            this.fallbackCopy(text);
        }
    }

    fallbackCopy(text) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        ta.setAttribute("readonly", "");
        document.body.appendChild(ta);
        ta.removeAttribute("readonly");
        ta.select();
        ta.setSelectionRange(0, 99999);
        document.execCommand("copy");
        document.body.removeChild(ta);
    }

    async handleCopyPrivateKey() {
        const privateKeyDisplay = document.getElementById("privateKeyDisplay");
        if (!privateKeyDisplay) return;
        const privateKey = privateKeyDisplay.value;
        await navigator.clipboard.writeText(privateKey);

        const copyBtn = document.getElementById("copyPrivateKey");
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = "Copied!";
            setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
        }
    }

    async handlePrivateKeyLogin() {
        const errorElement = document.getElementById("privateKeyError");
        if (errorElement) errorElement.textContent = "";

        const keyInput = document.getElementById("loginPrivateKey");
        const privateKey = keyInput ? keyInput.value : "";
        if (!privateKey) {
            if (errorElement) errorElement.textContent = "Please enter your recovery key";
            return;
        }

        // Check if user wants to reset password
        const newPassword = (document.getElementById("recoveryNewPassword")?.value || "").trim();
        const confirmPassword = (document.getElementById("recoveryConfirmPassword")?.value || "").trim();

        if (newPassword || confirmPassword) {
            if (newPassword !== confirmPassword) {
                if (errorElement) errorElement.textContent = "Passwords do not match";
                return;
            }
            if (newPassword.length < 8) {
                if (errorElement) errorElement.textContent = "Password must be at least 8 characters";
                return;
            }
        }

        try {
            await this.nostrClient.initialize(window.SignerType.PrivateKey, privateKey);

            // Login first to establish auth
            await this.login("privatekey");

            // If password reset was requested, do it now (we're authenticated)
            if (newPassword) {
                try {
                    const encrypted_nsec = window.encryptNsecWithPassword(privateKey, newPassword);
                    const apiBase = window.API_BASE || document.body.getAttribute("data-api-base") || "";
                    const resp = await this.post(`${apiBase}/api/v1/users/reset-password`, {
                        password: newPassword,
                        encrypted_nsec,
                    });
                    if (resp.ok) {
                        console.log("Password reset successful");
                    } else {
                        const msg = await resp.text();
                        console.warn("Password reset failed:", msg);
                        if (errorElement) errorElement.textContent = "Logged in, but password reset failed: " + msg;
                    }
                } catch (resetErr) {
                    console.warn("Password reset error:", resetErr);
                }
            }
        } catch (error) {
            console.error("Private key login failed:", error);
            if (errorElement) errorElement.textContent = "Login failed. Please check your private key.";
        }
    }

    getRelays() {
        const loginInput = document.getElementById("relayInput");
        const registerInput = document.getElementById("relayInputRegister");
        const input = loginInput?.value?.trim() || registerInput?.value?.trim() || "";
        if (input) {
            return input.split(",").map(r => r.trim()).filter(Boolean);
        }
        return window.DEFAULT_RELAYS || [];
    }

    async handleExtensionLogin() {
        const errorElement = document.getElementById("extensionLoginError");
        if (errorElement) errorElement.textContent = "";

        try {
            await this.nostrClient.initialize(window.SignerType.NIP07, null, this.getRelays());
            await this.login("extension");
        } catch (error) {
            console.error("Extension login failed:", error);
            if (errorElement) {
                if (error.toString().includes("No NIP-07")) {
                    errorElement.textContent = "No Nostr extension found. Please install a compatible extension.";
                } else {
                    errorElement.textContent = "Login failed. Please try again.";
                }
            }
        }
    }

    async handleExtensionRegistration() {
        const errorElement = document.getElementById("extensionRegisterError");
        if (errorElement) errorElement.textContent = "";

        try {
            await this.nostrClient.initialize(window.SignerType.NIP07, null, this.getRelays());
            await this.register();
            await this.login("extension");
        } catch (error) {
            console.error("Extension registration failed:", error);
            if (errorElement) {
                if (error.toString().includes("No NIP-07")) {
                    errorElement.textContent = "No Nostr extension found. Please install a compatible extension.";
                } else {
                    errorElement.textContent = "Registration failed. Please try again.";
                }
            }
        }
    }

    async handleUsernameLogin() {
        const errorElement = document.getElementById("usernameLoginError");
        if (errorElement) errorElement.textContent = "";

        const username = document.getElementById("loginUsername")?.value || "";
        const password = document.getElementById("loginPassword")?.value || "";

        if (!username || !password) {
            if (errorElement) errorElement.textContent = "Please enter username and password";
            return;
        }

        try {
            // Step 1: Verify password and get encrypted nsec
            const response = await fetch(`${this.apiBase}/api/v1/users/username/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            if (!response.ok) {
                const msg = await response.text();
                throw new Error(msg || "Invalid username or password");
            }

            const { encrypted_nsec } = await response.json();

            // Step 2: Decrypt nsec with password
            const nsec = window.decryptNsecWithPassword(encrypted_nsec, password);

            // Step 3: Initialize signer with decrypted nsec
            await this.nostrClient.initialize(window.SignerType.PrivateKey, nsec);

            // Step 4: Do normal nostr-auth login to get session
            await this.login("username");
        } catch (error) {
            console.error("Username login failed:", error);
            if (errorElement) errorElement.textContent = error.message || "Login failed";
        }
    }

    async handleUsernameRegister() {
        const errorElement = document.getElementById("usernameRegisterError");
        if (errorElement) errorElement.textContent = "";

        // Prevent double-submit
        const btn = document.getElementById("usernameRegisterButton");
        if (btn && btn.disabled) return;
        if (btn) btn.disabled = true;

        const username = document.getElementById("registerUsernameInput")?.value || "";
        const password = document.getElementById("registerPasswordInput")?.value || "";
        const confirmPassword = document.getElementById("registerPasswordConfirm")?.value || "";

        if (!username || !password) {
            if (errorElement) errorElement.textContent = "Please fill in all fields";
            if (btn) btn.disabled = false;
            return;
        }

        if (password !== confirmPassword) {
            if (errorElement) errorElement.textContent = "Passwords do not match";
            if (btn) btn.disabled = false;
            return;
        }

        try {
            // Step 1: Generate new nostr keypair
            await this.nostrClient.initialize(window.SignerType.PrivateKey, null);
            const nsec = await this.nostrClient.getPrivateKey();
            const pubkey = await this.nostrClient.getPublicKey();

            // Step 2: Encrypt nsec with password
            const encrypted_nsec = window.encryptNsecWithPassword(nsec, password);

            // Step 3: Register with server
            const response = await fetch(`${this.apiBase}/api/v1/users/username/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    password,
                    encrypted_nsec,
                    nostr_pubkey: pubkey,
                }),
            });

            if (!response.ok) {
                const msg = await response.text();
                throw new Error(msg || "Registration failed");
            }

            // Step 4: Show recovery key (encrypted nsec)
            const step1 = document.getElementById("usernameRegisterStep1");
            if (step1) step1.classList.add("is-hidden");
            const step2 = document.getElementById("usernameRegisterStep2");
            if (step2) step2.classList.remove("is-hidden");

            const recoveryKeyDisplay = document.getElementById("recoveryKeyDisplay");
            if (recoveryKeyDisplay) recoveryKeyDisplay.value = nsec;

            // Clear lightning address field (browser autofill may have put the nsec here)
            const lnInput = document.getElementById("registerLightningAddress");
            if (lnInput) lnInput.value = "";

            // Step 5: User must confirm they saved recovery key, then click Continue
        } catch (error) {
            console.error("Username registration failed:", error);
            if (errorElement) errorElement.textContent = error.message || "Registration failed";
            if (btn) btn.disabled = false;
        }
    }

    async handleRegistrationComplete() {
        try {
            await this.register();
            this.showRegistrationSuccess();
            await this.login("privatekey");
        } catch (error) {
            console.error("Registration failed:", error);
        }
    }

    showRegistrationSuccess() {
        const step1 = document.getElementById("registerStep1");
        if (step1) step1.classList.add("is-hidden");
        const step2 = document.getElementById("registerStep2");
        if (step2) step2.classList.remove("is-hidden");

        setTimeout(() => { this.hideRegisterModal(); }, 2000);
    }

    handleLogout() {
        localStorage.removeItem("gameSession");
        localStorage.removeItem("gameUsername");
        localStorage.removeItem("gameSignerType");
        localStorage.removeItem("lightningAddress");
        localStorage.removeItem("banned");
        localStorage.removeItem("banReason");

        this.nostrClient = new window.NostrClientWrapper();
        this.sessionId = null;
        this.username = null;

        this.updateAuthUI();

        window.dispatchEvent(new CustomEvent("auth:logout"));

        // Navigate to home screen
        const navHome = document.getElementById("nav-home-link");
        if (navHome) {
            navHome.click();
        }
    }

    async createAuthHeader(url, method, body) {
        return this.nostrClient.getAuthHeader(url, method, body || null);
    }

    async get(url, options) {
        options = options || {};
        const authHeader = await this.createAuthHeader(url, "GET", null);
        return fetch(url, {
            ...options,
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
                Authorization: authHeader,
            },
        });
    }

    async post(url, body, options) {
        options = options || {};
        const authHeader = await this.createAuthHeader(url, "POST", body || null);
        return fetch(url, {
            ...options,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
                Authorization: authHeader,
            },
            body: body ? JSON.stringify(body) : null,
        });
    }

    async register() {
        const pubkey = await this.nostrClient.getPublicKey();
        const response = await this.post(`${this.apiBase}/api/v1/users/register`, {
            username: `player_${pubkey.substring(0, 8)}`,
        });

        if (!response.ok) {
            throw new Error(`Registration failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    async login(signerType) {
        const response = await this.post(`${this.apiBase}/api/v1/users/login`);

        if (!response.ok) {
            throw new Error(`Login failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        this.sessionId = data.session_id;
        this.username = data.username;

        localStorage.setItem("gameSession", this.sessionId);
        localStorage.setItem("gameUsername", this.username);
        localStorage.setItem("gameSignerType", signerType || "privatekey");

        // Cache lightning address for payment flow
        if (data.lightning_address) {
            localStorage.setItem("lightningAddress", data.lightning_address);
        } else {
            localStorage.removeItem("lightningAddress");
        }

        // Cache ban status
        if (data.banned) {
            localStorage.setItem("banned", "1");
            localStorage.setItem("banReason", data.ban_reason || "");
        } else {
            localStorage.removeItem("banned");
            localStorage.removeItem("banReason");
        }

        this.updateAuthUI();

        this.hideLoginModal();
        this.hideRegisterModal();

        window.dispatchEvent(
            new CustomEvent("auth:login", {
                detail: {
                    sessionId: this.sessionId,
                    username: this.username,
                },
            })
        );

        // After login/register, navigate to home unless already on the game page
        if (window.location.pathname !== "/" && window.location.pathname !== "/play") {
            const navHome = document.getElementById("nav-home-link");
            if (navHome) {
                navHome.click();
            }
        }

        return data;
    }

    restoreSession() {
        // Only restore if we have a way to authenticate (e.g. NIP-07 extension)
        // Private key sessions can't survive a page reload since the key isn't stored
        const signerType = localStorage.getItem("gameSignerType");
        this.sessionId = localStorage.getItem("gameSession");
        this.username = localStorage.getItem("gameUsername");

        if (this.sessionId && this.username && signerType === "extension") {
            // Re-initialize with extension signer
            this.nostrClient.initialize(window.SignerType.NIP07, null, this.getRelays())
                .then(() => {
                    this.updateAuthUI();
                    window.dispatchEvent(
                        new CustomEvent("auth:login", {
                            detail: {
                                sessionId: this.sessionId,
                                username: this.username,
                            },
                        })
                    );
                })
                .catch(() => {
                    // Extension not available, clear stale session
                    this.clearSession();
                });
        } else {
            // No valid signer for restore, clear stale session
            this.clearSession();
        }
    }

    clearSession() {
        localStorage.removeItem("gameSession");
        localStorage.removeItem("gameUsername");
        localStorage.removeItem("gameSignerType");
        this.sessionId = null;
        this.username = null;
        this.updateAuthUI();
    }

    updateAuthUI() {
        const authButtons = document.getElementById("authButtons");
        const userInfoArea = document.getElementById("userInfoArea");
        const usernameDisplay = document.getElementById("usernameDisplay");
        const playGameNav = document.getElementById("play-game-nav");
        const homeAuthCta = document.getElementById("home-auth-cta");
        const homePlayCta = document.getElementById("home-play-cta");

        if (this.sessionId && this.username) {
            if (authButtons) authButtons.classList.add("is-hidden");
            if (userInfoArea) userInfoArea.classList.remove("is-hidden");
            if (usernameDisplay) usernameDisplay.textContent = this.username;
            if (playGameNav) playGameNav.style.display = "inline-block";
            if (homeAuthCta) homeAuthCta.classList.add("is-hidden");
            if (homePlayCta) homePlayCta.classList.remove("is-hidden");
        } else {
            if (authButtons) authButtons.classList.remove("is-hidden");
            if (userInfoArea) userInfoArea.classList.add("is-hidden");
            if (playGameNav) playGameNav.style.display = "none";
            if (homeAuthCta) homeAuthCta.classList.remove("is-hidden");
            if (homePlayCta) homePlayCta.classList.add("is-hidden");
        }
    }

    isLoggedIn() {
        return !!this.sessionId;
    }

    getSessionId() {
        return this.sessionId;
    }
}

// Initialize auth client
// This runs immediately since this script is loaded dynamically after DOMContentLoaded has already fired
async function initAuth() {
    console.log("initAuth called, NostrClientWrapper available:", !!window.NostrClientWrapper);
    const apiBase = window.API_BASE || document.body.getAttribute("data-api-base") || "";
    const auth = new AuthClient(apiBase);
    await auth.initialize();

    window.gameAuth = auth;
    window.gameAuth.showLoginModal = auth.showLoginModal.bind(auth);
    window.gameAuth.showRegisterModal = auth.showRegisterModal.bind(auth);

    // Setup HTMX auth if available
    if (window.setupHtmxAuth) {
        window.setupHtmxAuth();
    }

    // Re-bind event listeners after HTMX swaps (for dynamically loaded content)
    document.body.addEventListener("htmx:afterSwap", function () {
        auth.setupEventListeners();
        auth.updateAuthUI();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { initAuth().catch(console.error); });
} else {
    initAuth().catch(console.error);
}
