import { Server } from "./core/server.ts";
import { fs } from './deno/deps.ts';
import { DenoServer, logger } from './deno/server.ts';

const args = Deno.args;
const start = Deno.build.os == 'windows' ? 'run.bat' : 'run.sh';
let started = false;
let plugins = true;
let devMode = false;

args.forEach((x) => {
	switch (x) {
		case 'clearData':
			logger.log('Removing all server data...');
			['world', 'player'].forEach((x) => (fs.existsSync(x) ? Deno.removeSync(x, { recursive: true }) : null));
			logger.reopenFile();
			break;
		case 'help':
			displayHelp();
			started = true;
			break;
		case 'update':
			update();
			started = true;
			break;
		case 'no-plugins':
			plugins = false;
			break;
		case 'dev-mode':
			devMode = true;
			break;
		case 'version':
			version();
			started = true;
			break;
		default:
			console.log(`${Server.softwareName} > Unknown argument ${x}`);
	}
});

let srv: DenoServer | null = null;

if (!started) {
	started = true;
	try {
		srv = new DenoServer(plugins, devMode);
		srv._startServer();
	} catch (e) {
		logger.critical('Critical error!');
		logger.critical(e);
		Deno.exit(1);
	}
}

export const server = srv;


function displayHelp() {
	console.log(
		`${Server.softwareName} version ${Server.softwareVersion} - Help\n`,
		`Available commands:\n`,
		` ${start} help - displays this help page\n`,
		` ${start} no-plugins - starts server without loading plugins\n`,
		` ${start} version - writes used version\n`,
		` ${start} dev-mode - starts server in devmode\n`

		//` ${start} update - updates server to latest release\n`
	);
}

function update() {}

function version() {
	console.log(
		`\nServer software name: ${Server.softwareName}\n` +
			`Server version: ${Server.softwareVersion}\n` +
			`Target game: ${Server.targetGame}\n` +
			`Target version: ${Server.targetVersion}\n` +
			`Deno: ${Deno.version.deno} (v8: ${Deno.version.v8}, Typescript: ${Deno.version.typescript})\n`
	);
}
