// Profile modal handler — stats, lightning address, and prize claiming

class ProfileHandler {
    constructor() {
        this.initialized = false;
        this.currentClaimPrize = null;
    }

    init() {
        this.modal = document.getElementById("profileModal");
        this.closeBtn = document.getElementById("closeProfileModal");
        this.profileBtn = document.getElementById("profileBtn");
        this.usernameDisplay = document.getElementById("usernameDisplay");
        this.lightningInput = document.getElementById("lightningAddressInput");
        this.statusEl = document.getElementById("lightningAddressStatus");
        this.saveBtn = document.getElementById("saveLightningAddress");
        this.clearBtn = document.getElementById("clearLightningAddress");

        if (!this.modal) return false;

        this.setupEventListeners();
        this.initialized = true;
        return true;
    }

    setupEventListeners() {
        if (this.profileBtn) {
            this.profileBtn.addEventListener("click", () => this.show());
        }
        if (this.usernameDisplay) {
            this.usernameDisplay.addEventListener("click", () => this.show());
        }
        if (this.closeBtn) {
            this.closeBtn.addEventListener("click", () => this.hide());
        }
        if (this.saveBtn) {
            this.saveBtn.addEventListener("click", () => this.saveLightningAddress());
        }
        if (this.clearBtn) {
            this.clearBtn.addEventListener("click", () => this.clearLightningAddress());
        }

        const claimBtn = document.getElementById("claimPrizeBtn");
        if (claimBtn) claimBtn.addEventListener("click", () => this.claimWithInvoice());

        const claimLnurlBtn = document.getElementById("claimViaLnurlBtn");
        if (claimLnurlBtn) claimLnurlBtn.addEventListener("click", () => this.claimViaLnurl());
    }

    async show() {
        if (!this.modal) return;
        this.modal.classList.add("is-active");
        await this.loadProfile();
        await this.checkPrizeEligibility();
    }

    hide() {
        if (this.modal) this.modal.classList.remove("is-active");
        this.setStatus("", "");
    }

    setStatus(message, type) {
        if (!this.statusEl) return;
        this.statusEl.textContent = message;
        this.statusEl.className = "help-text";
        if (type === "success") this.statusEl.classList.add("nes-text", "is-success");
        else if (type === "error") this.statusEl.classList.add("nes-text", "is-error");
    }

    setPrizeStatus(message, type) {
        const el = document.getElementById("prizeClaimStatus");
        if (!el) return;
        el.textContent = message;
        el.className = "help-text";
        if (type === "success") el.classList.add("nes-text", "is-success");
        else if (type === "error") el.classList.add("nes-text", "is-error");
    }

    async loadProfile() {
        if (!window.gameAuth || !window.gameAuth.isLoggedIn()) return;

        try {
            const apiBase = window.API_BASE || document.body.getAttribute("data-api-base") || "";
            const response = await window.gameAuth.get(`${apiBase}/api/v1/users/profile`);

            if (!response.ok) {
                console.error("Failed to load profile:", response.status);
                return;
            }

            const data = await response.json();

            // Populate lightning address
            if (this.lightningInput) {
                this.lightningInput.value = data.lightning_address || "";
            }

            // Show current status
            if (data.lightning_address) {
                this.setStatus("Current: " + data.lightning_address + " (prizes auto-pay here)", "success");
            } else {
                this.setStatus("No lightning address set — prizes require manual invoice claim", "");
            }

            // Store it for payment flow
            localStorage.setItem("lightningAddress", data.lightning_address || "");

            // Show ban banner if applicable
            const banBanner = document.getElementById("profileBanBanner");
            if (banBanner) {
                const isBanned = localStorage.getItem("banned") === "1";
                if (isBanned) {
                    const reason = localStorage.getItem("banReason") || "Account suspended";
                    banBanner.style.display = "block";
                    banBanner.innerHTML = `<strong>Account Suspended</strong><br><span style="font-size: 0.85em;">${reason}</span>`;
                    this.showProfileAlert("banned");
                } else {
                    banBanner.style.display = "none";
                }
            }

            // Populate recent winnings history
            this.renderWinningsHistory(data.recent_winnings || []);

            // Populate stats
            const stats = data.stats || {};
            this.setStat("profileHighScore", stats.highScore || 0);
            this.setStat("profileTotalPlays", stats.totalPlays || 0);
            this.setStat("profileGamesPurchased", stats.totalGamesPurchased || 0);
            this.setStat("profileTotalSpent", (stats.totalSpentSats || 0) + " sats");
            this.setStat("profilePrizesWon", stats.prizesWon || 0);
            this.setStat("profileTotalEarned", (stats.totalEarnedSats || 0) + " sats");
        } catch (error) {
            console.error("Error loading profile:", error);
        }
    }

    setStat(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // ── Prize eligibility check ──────────────────────────────────────────

    async checkPrizeEligibility() {
        if (!window.gameAuth || !window.gameAuth.isLoggedIn()) return;

        const section = document.getElementById("prizeClaimSection");
        if (!section) return;

        try {
            const apiBase = window.API_BASE || document.body.getAttribute("data-api-base") || "";
            const response = await window.gameAuth.get(`${apiBase}/api/v1/prizes/check`);
            if (!response.ok) return;

            const data = await response.json();
            const prizes = data.pending_prizes || [];
            this.currentClaimPrizes = prizes;

            if (prizes.length > 0) {
                section.style.display = "block";

                const info = document.getElementById("prizeClaimInfo");
                if (info) {
                    if (prizes.length === 1) {
                        const p = prizes[0];
                        const statusTag = p.status === "failed" ? ' <span class="nes-text is-error">(retry)</span>' : "";
                        info.innerHTML = `You won <strong>${p.amount} sats</strong> on ${p.date}!${statusTag}`;
                    } else {
                        const rows = prizes.map(p => {
                            const statusTag = p.status === "failed" ? " (retry)" : "";
                            return `<li>${p.date}: <strong>${p.amount} sats</strong>${statusTag}</li>`;
                        }).join("");
                        info.innerHTML = `You have <strong>${prizes.length} unclaimed prizes</strong>:<ul style="margin-top:4px;font-size:0.9em;">${rows}</ul>`;
                    }
                }

                // For claiming, use the first prize (oldest unclaimed)
                this.currentClaimPrize = prizes[prizes.length - 1]; // oldest first

                const lnAddr = localStorage.getItem("lightningAddress");
                const lnurlBtn = document.getElementById("claimViaLnurlBtn");
                if (lnurlBtn) {
                    lnurlBtn.style.display = lnAddr ? "inline-block" : "none";
                }

                this.showProfileAlert("prize");
                this.setPrizeStatus("", "");
            } else {
                section.style.display = "none";
                this.checkBanAlert();
            }
        } catch (error) {
            console.error("Error checking prize eligibility:", error);
        }
    }

    showProfileAlert(type) {
        // type: "prize" (green), "banned" (red), or false (clear)
        const btn = document.getElementById("profileBtn");
        if (!btn) return;
        const existing = document.getElementById("profileAlertBadge");
        if (existing) existing.remove();

        if (!type) return;

        const color = type === "banned" ? "#ff4444" : "#00cc44";
        const span = document.createElement("span");
        span.id = "profileAlertBadge";
        span.textContent = "!";
        span.style.cssText = `background: ${color}; color: #fff; border-radius: 50%; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.7em; position: absolute; top: -6px; right: -6px;`;
        btn.style.position = "relative";
        btn.appendChild(span);
    }

    renderWinningsHistory(winnings) {
        const section = document.getElementById("prizeHistorySection");
        const list = document.getElementById("prizeHistoryList");
        if (!section || !list) return;

        if (winnings.length === 0) {
            section.style.display = "none";
            return;
        }

        section.style.display = "block";
        const rows = winnings.map(w => {
            const paidDate = w.paid_at ? w.paid_at.substring(0, 16).replace("T", " ") : "";
            return `<tr><td>${w.date}</td><td class="nes-text is-success">${w.amount_sats} sats</td><td>${paidDate}</td></tr>`;
        }).join("");

        list.innerHTML = `<table style="width:100%"><tr><th>Date</th><th>Prize</th><th>Paid</th></tr>${rows}</table>`;
    }

    checkBanAlert() {
        const isBanned = localStorage.getItem("banned") === "1";
        if (isBanned) {
            this.showProfileAlert("banned");
        }
    }

    // ── Prize claiming ───────────────────────────────────────────────────

    async claimWithInvoice() {
        if (!this.currentClaimPrize) return;

        const input = document.getElementById("prizeInvoiceInput");
        const invoice = input ? input.value.trim() : "";
        if (!invoice) {
            this.setPrizeStatus("Paste a bolt11 invoice to claim your prize", "error");
            return;
        }

        await this.submitClaim(invoice);
    }

    async claimViaLnurl() {
        if (!this.currentClaimPrize) return;
        // Send claim without an invoice — server will resolve via LNURL
        await this.submitClaim(null);
    }

    async submitClaim(invoice) {
        const claimBtn = document.getElementById("claimPrizeBtn");
        const lnurlBtn = document.getElementById("claimViaLnurlBtn");
        if (claimBtn) claimBtn.disabled = true;
        if (lnurlBtn) lnurlBtn.disabled = true;

        this.setPrizeStatus("Processing claim...", "");

        try {
            const apiBase = window.API_BASE || document.body.getAttribute("data-api-base") || "";
            const body = { date: this.currentClaimPrize.date };
            if (invoice) body.invoice = invoice;

            const response = await window.gameAuth.post(`${apiBase}/api/v1/prizes/claim`, body);

            if (response.ok) {
                const data = await response.json();
                this.setPrizeStatus(`Prize claimed! ${data.amount} sats sent.`, "success");
                this.currentClaimPrize = null;

                // Refresh profile + re-check prizes after a moment.
                // If no more pending prizes, claim section hides and history shows.
                setTimeout(async () => {
                    await this.loadProfile();
                    await this.checkPrizeEligibility();
                }, 1500);
            } else {
                const text = await response.text();
                this.setPrizeStatus(text || "Claim failed", "error");
            }
        } catch (error) {
            console.error("Error claiming prize:", error);
            this.setPrizeStatus("Network error — please try again", "error");
        } finally {
            if (claimBtn) claimBtn.disabled = false;
            if (lnurlBtn) lnurlBtn.disabled = false;
        }
    }

    // ── Lightning address management ─────────────────────────────────────

    async saveLightningAddress() {
        if (!window.gameAuth || !window.gameAuth.isLoggedIn()) return;
        const address = this.lightningInput ? this.lightningInput.value.trim() : "";

        if (!address) {
            this.setStatus("Enter a lightning address or use Clear to remove", "error");
            return;
        }

        this.setStatus("Saving...", "");
        this.saveBtn.disabled = true;

        try {
            const apiBase = window.API_BASE || document.body.getAttribute("data-api-base") || "";
            const response = await window.gameAuth.post(
                `${apiBase}/api/v1/users/lightning-address`,
                { lightning_address: address }
            );

            if (response.ok) {
                const data = await response.json();
                if (this.lightningInput) {
                    this.lightningInput.value = data.lightning_address || address;
                }
                localStorage.setItem("lightningAddress", data.lightning_address || address);
                this.setStatus("Lightning address saved! Prizes will be sent here automatically.", "success");
            } else {
                const text = await response.text();
                this.setStatus(text || "Failed to save", "error");
            }
        } catch (error) {
            console.error("Error saving lightning address:", error);
            this.setStatus("Network error — please try again", "error");
        } finally {
            this.saveBtn.disabled = false;
        }
    }

    async clearLightningAddress() {
        if (!window.gameAuth || !window.gameAuth.isLoggedIn()) return;

        this.setStatus("Clearing...", "");
        this.clearBtn.disabled = true;

        try {
            const apiBase = window.API_BASE || document.body.getAttribute("data-api-base") || "";
            const response = await window.gameAuth.post(
                `${apiBase}/api/v1/users/lightning-address`,
                { lightning_address: null }
            );

            if (response.ok) {
                if (this.lightningInput) this.lightningInput.value = "";
                localStorage.removeItem("lightningAddress");
                this.setStatus("Lightning address cleared. You'll need to submit invoices manually for prizes.", "success");
            } else {
                const text = await response.text();
                this.setStatus(text || "Failed to clear", "error");
            }
        } catch (error) {
            console.error("Error clearing lightning address:", error);
            this.setStatus("Network error — please try again", "error");
        } finally {
            this.clearBtn.disabled = false;
        }
    }
}

// Initialize
window.gameProfile = new ProfileHandler();

function initProfile() {
    if (window.gameProfile) {
        window.gameProfile.init();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProfile);
} else {
    initProfile();
}

// Re-init after HTMX swaps
document.body.addEventListener("htmx:afterSwap", function () {
    if (window.gameProfile && !window.gameProfile.initialized) {
        window.gameProfile.init();
    }
});

// Check for pending prizes and ban status after login
window.addEventListener("auth:login", function () {
    if (window.gameProfile && window.gameProfile.initialized) {
        window.gameProfile.checkBanAlert();
        window.gameProfile.checkPrizeEligibility();
    }
});
