// 1. Initialisation de l'APM Datadog (OBLIGATOIREMENT EN PREMIER)
const tracer = require('dd-trace').init({
  logInjection: true, // Injecte automatiquement les IDs de trace dans les logs
  plugins: true // S'assure que tous les plugins d'intégration automatique (dont fetch/http) sont actifs
});

const express = require('express');
const StatsD = require('hot-shots');
const winston = require('winston'); // <-- Importation de Winston important pour correler traces & logs

// 2.1 Configuration du client DogStatsD pour les métriques
const dogstatsd = new StatsD({
  host: process.env.DD_AGENT_HOST || 'localhost',
  port: 8125,
  prefix: 'myapp.'
});

// 2.2 Configuration du Logger Winston 
const logger = winston.createLogger({
	// level: 'debug', pour Afficher les logs du plus bas (debug) au plus haut niveau 
level: 'info', 
format: winston.format.combine( 
winston.format.timestamp(), 
winston.format.errors({ stack: true }), // Indispensable pour capturer la stack trace
winston.format.json() // Format final pour Datadog 
), 
transports: [ 
new winston.transports.Console() 
]
});

const app = express();
const PORT = process.env.PORT || 3000;

// 4. Middleware global : utilise Winston à la place de console.log
app.use((req, res, next) => { 
   res.on('finish', () => { 
const statusType = res.statusCode >= 400 ? 'warn' : 'info'; // Winston va automatiquement fusionner les métadonnées et injecter le trace_id 
logger.log(statusType, `Requête ${req.method} ${req.originalUrl}`, { 
    message: `Requête ${req.method} ${req.originalUrl}`,
    http_status: res.statusCode, 
    http: { 
   status_code: res.statusCode 
 		    }, 
    route: req.path,
    timestamp: new Date().toISOString()
}); 
  }); 
  next(); 
});

app.get('/back_appel', async (req, res) => { 
// Simule un ralentissement spécifique sur l'instance back 2 (ou aléatoire) 

if (process.env.DD_SERVICE === 'my-node-back-2') 
{
// Pause de 5 secondes pour générer un ralentissement
await new Promise(resolve => setTimeout(resolve, 2000));
} 

// Log explicite pour tracer le traitement dans le back 
logger.info('Traitement de la requête reçue sur le serveur back',{ 
route: req.path, 
method: req.method, 
service: process.env.DD_SERVICE 
});
res.send(` ${process.env.DD_SERVICE} - Réponse du serveur back reçue avec succès !`); 
}); 

// 5. Route de test d'erreur (pour visualiser les exceptions dans l'APM Datadog)
app.get('/error', (req, res) => {
  throw new Error("C'est une erreur de test volontaire pour Datadog APM !");
});

// 6. Gestionnaire 404 (À placer TOUT À LA FIN, après toutes les routes valides)
app.use((req, res, next) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Erreur 404 - Page non trouvée</title>
      </head>
      <body>
        <h1>404 - Introuvable</h1>
        <p>La ressource <code>${req.originalUrl}</code> demandée n'existe pas.</p>
      </body>
    </html>
  `);
});

// 7. Démarrage du serveur
app.listen(PORT, () => {
logger.info(`Serveur démarré avec succès sur le port ${PORT}`, {
port: PORT, 
service: process.env.DD_SERVICE 
}); 
}); 


