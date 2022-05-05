export { LittleConf, LittleConfOptions } from './littleconf.js';
import { LittleConf, LittleConfOptions } from './littleconf.js';
import sha1 from 'sha1';

let configCache: { [optionsHash: string]: any } = {};




export async function getConfig(options: LittleConfOptions = {}): Promise<any> {
	let optionsHash = sha1(JSON.stringify(options));
	if (configCache[optionsHash]) return configCache[optionsHash];
	let lc = new LittleConf(options);
	configCache[optionsHash] = await lc.loadConfig();
	return configCache[optionsHash];
}


