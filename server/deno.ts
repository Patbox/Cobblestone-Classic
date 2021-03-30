import { DenoServer } from './deno/server.ts';

const args = Deno.args;
const start = Deno.build.os == 'windows' ? 'run.bat' : 'run.sh';
let started = false;
let plugins = true;
let devMode = false;

args.forEach((x) => {
	switch (x) {
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
			console.log(`${DenoServer.softwareName} > Unknown argument ${x}`);
	}
});

if (!started) {
	started = true;
	const server = new DenoServer(plugins, devMode);
	server._startServer();
}

function displayHelp() {
	console.log(
		`${DenoServer.softwareName} version ${DenoServer.softwareVersion} - Help\n`,
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
		`\nServer software name: ${DenoServer.softwareName}\n` +
			`Server version: ${DenoServer.softwareVersion}\n` +
			`Target game: ${DenoServer.targetGame}\n` +
			`Target version: ${DenoServer.targetVersion}\n` +
			`Deno: ${Deno.version.deno} (v8: ${Deno.version.v8}, Typescript: ${Deno.version.typescript})\n`
	);
}
