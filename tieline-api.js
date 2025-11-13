// API Tieline - Connexion réelle aux codecs Merlin/Bridge-It
// ==========================================================

class TielineAPI {
    constructor() {
        this.baseUrl = '';
        this.isConnected = false;
        this.pollingInterval = null;
        this.currentState = {
            connected: false,
            profile: 'N/A',
            bitrateTx: 0,
            bitrateRx: 0,
            jitter: 0,
            packetLoss: 0,
            audioLevelIn: -60,
            audioLevelOut: -60,
            muted: false,
            codecType: 'Unknown',
            connectionDuration: 0
        };
    }

    // ==========================================
    // CONNEXION AU CODEC
    // ==========================================
    
    async connect(ip, port = 80, username = 'admin', password = '') {
        this.baseUrl = `http://${ip}:${port}`;
        
        try {
            // Tentative de connexion à l'API REST Tieline
            const response = await fetch(`${this.baseUrl}/api/v1/system/info`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Basic ' + btoa(username + ':' + password)
                },
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                this.isConnected = true;
                this.currentState.connected = true;
                this.currentState.codecType = data.model || 'Tieline Codec';
                return { success: true, data: data };
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Erreur de connexion:', error);
            return { success: false, error: error.message };
        }
    }

    disconnect() {
        this.isConnected = false;
        this.currentState.connected = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // ==========================================
    // RÉCUPÉRATION DES DONNÉES
    // ==========================================
    
    async getStatus() {
        if (!this.isConnected) return null;
        
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/status`);
            const data = await response.json();
            
            // Mise à jour de l'état
            this.updateState(data);
            return data;
        } catch (error) {
            console.error('Erreur getStatus:', error);
            return null;
        }
    }

    async getAudioStats() {
        if (!this.isConnected) return null;
        
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/audio/statistics`);
            return await response.json();
        } catch (error) {
            console.error('Erreur getAudioStats:', error);
            return null;
        }
    }

    async getConnectionStats() {
        if (!this.isConnected) return null;
        
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/connection/statistics`);
            const data = await response.json();
            
            // Mise à jour des statistiques réseau
            if (data) {
                this.currentState.bitrateTx = data.bitrate_tx || 0;
                this.currentState.bitrateRx = data.bitrate_rx || 0;
                this.currentState.jitter = data.jitter || 0;
                this.currentState.packetLoss = data.packet_loss || 0;
            }
            
            return data;
        } catch (error) {
            console.error('Erreur getConnectionStats:', error);
            return null;
        }
    }

    // ==========================================
    // CONTRÔLES
    // ==========================================
    
    async setMute(channel = 'tx', mute = true) {
        if (!this.isConnected) return { success: false, error: 'Non connecté' };
        
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/audio/mute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: channel, mute: mute })
            });
            
            if (response.ok) {
                this.currentState.muted = mute;
                return { success: true };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async setProfile(profileId) {
        if (!this.isConnected) return { success: false, error: 'Non connecté' };
        
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/profiles/${profileId}/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                this.currentState.profile = profileId;
                return { success: true };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async reboot() {
        if (!this.isConnected) return { success: false, error: 'Non connecté' };
        
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/system/reboot`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.disconnect();
                return { success: true };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // MISE À JOUR DE L'ÉTAT INTERNE
    // ==========================================
    
    updateState(data) {
        if (!data) return;
        
        this.currentState = {
            ...this.currentState,
            profile: data.active_profile || this.currentState.profile,
            bitrateTx: data.bitrate_tx || this.currentState.bitrateTx,
            bitrateRx: data.bitrate_rx || this.currentState.bitrateRx,
            jitter: data.jitter || this.currentState.jitter,
            packetLoss: data.packet_loss || this.currentState.packetLoss,
            audioLevelIn: data.audio_level_in || this.currentState.audioLevelIn,
            audioLevelOut: data.audio_level_out || this.currentState.audioLevelOut,
            muted: data.muted || this.currentState.muted,
            connectionDuration: data.connection_duration || this.currentState.connectionDuration
        };
    }

    // ==========================================
    // POLLING AUTOMATIQUE
    // ==========================================
    
    startPolling(interval = 2000, callback) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        this.pollingInterval = setInterval(async () => {
            await this.getStatus();
            await this.getConnectionStats();
            
            if (callback && typeof callback === 'function') {
                callback(this.currentState);
            }
        }, interval);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // ==========================================
    // EXPORT POUR CLOCK ON AIR
    // ==========================================
    
    /**
     * Retourne l'état formaté pour intégration dans Clock On Air
     * Format compatible avec les widgets/overlays
     */
    getStateForClockOnAir() {
        return {
            // État de connexion
            isConnected: this.currentState.connected,
            codecType: this.currentState.codecType,
            
            // Audio
            audioStatus: {
                muted: this.currentState.muted,
                inputLevel: this.currentState.audioLevelIn,
                outputLevel: this.currentState.audioLevelOut
            },
            
            // Connexion réseau
            network: {
                bitrate: `${this.currentState.bitrateTx}/${this.currentState.bitrateRx} kbps`,
                jitter: `${this.currentState.jitter} ms`,
                packetLoss: `${this.currentState.packetLoss.toFixed(2)}%`,
                quality: this.getConnectionQuality()
            },
            
            // Profil actif
            activeProfile: this.currentState.profile,
            
            // Durée de connexion
            duration: this.formatDuration(this.currentState.connectionDuration),
            
            // Timestamp
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Évalue la qualité de connexion (pour affichage visuel)
     */
    getConnectionQuality() {
        if (!this.isConnected) return 'disconnected';
        
        const jitter = this.currentState.jitter;
        const loss = this.currentState.packetLoss;
        
        if (jitter < 10 && loss < 0.1) return 'excellent';
        if (jitter < 30 && loss < 0.5) return 'good';
        if (jitter < 50 && loss < 1.0) return 'fair';
        return 'poor';
    }

    /**
     * Formate la durée de connexion
     */
    formatDuration(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Exporte les données au format JSON pour API externe
     */
    exportJSON() {
        return JSON.stringify(this.getStateForClockOnAir(), null, 2);
    }
}

// Export de l'instance globale
const tielineAPI = new TielineAPI();

// Exposition pour utilisation dans l'interface
if (typeof window !== 'undefined') {
    window.TielineAPI = TielineAPI;
    window.tielineAPI = tielineAPI;
}