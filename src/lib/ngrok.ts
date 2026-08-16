import { serverConfig } from '../config/serverConfig.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchAndSetNgrokUrl() {
  if (process.env.ENABLE_NGROK_TUNNEL !== 'true') {
    console.log('[Ngrok] Túnel deshabilitado. Saltando captura de URL.');
    return;
  }
  
  console.log('[Ngrok] Intentando obtener la URL pública...');
  
  for (let i = 0; i < 10; i++) {
    try {
      // ngrok expone un API en el puerto 4040. Llamamos al servicio 'ngrok'
      const response = await fetch('http://ngrok:4040/api/tunnels');
      
      if (!response.ok) {
        throw new Error(`Ngrok API respondió con status: ${response.status}`);
      }
      
      const data = await response.json() as any;
      const httpTunnel = data.tunnels.find((tunnel: any) => tunnel.proto === 'https');

      if (httpTunnel?.public_url) {
        serverConfig.webhookUrl = httpTunnel.public_url;
        console.log(`[Ngrok] URL pública capturada con éxito: ${serverConfig.webhookUrl}`);
        return;
      }
    } catch (error) {
      console.warn(`[Ngrok] Intento ${i + 1} fallido. Reintentando en 3 segundos...`);
      await sleep(3000);
    }
  }

  console.error("[Ngrok] No se pudo obtener la URL pública de ngrok. El servidor continuará sin ella.");
}