/**
 * ==========================================================================
 * INICIALIZACIÓN DIRECTA DEL CLIENTE SUPABASE
 * ==========================================================================
 */

(function () {
    // Inicializar el cliente global
    window.supabaseClient = null;

    window.initializeSupabase = function(url, key) {
        if (!url || !key || url.includes("tu-proyecto") || key.includes("tu-anon-key")) {
            console.warn("Por favor, configura las credenciales reales de tu proyecto de Supabase en js/config.js");
            return false;
        }
        
        try {
            if (typeof supabase === 'undefined') {
                console.error("El SDK de Supabase no está cargado desde el CDN.");
                return false;
            }
            
            // Creamos la instancia segura
            window.supabaseClient = supabase.createClient(url, key);
            return true;
        } catch (e) {
            console.error("Error al inicializar el SDK de Supabase:", e);
            return false;
        }
    };

    // Intentar inicializar automáticamente usando el archivo js/config.js
    if (window.SUPABASE_CONFIG) {
        const url = window.SUPABASE_CONFIG.SUPABASE_URL;
        const key = window.SUPABASE_CONFIG.SUPABASE_ANON_KEY;
        const success = window.initializeSupabase(url, key);
        if (success) {
            console.log("Supabase inicializado correctamente desde js/config.js.");
        }
    }
})();
