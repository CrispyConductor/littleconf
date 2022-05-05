import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import * as objtools from 'objtools';

export type LittleConfOptions = {
	argv?: { [argKey: string]: any },
	environmentOverride?: string,
	cliArgumentEnvironment?: string,
	rootDir?: string,
	envVariableEnvironment?: string,
	defaultEnvironment?: string,
	defaultsFilename?: string,
	filenameOverride?: string,
	filename?: string,
	cliArgumentFile?: string,
	envVariableFile?: string,
	projectName?: string
};

/**
 * Class containing main logic for littleconf.
 *
 * @class LittleConf
 * @constructor
 * @param {Object} [options]
 *   @param {Object} [options.argv] - A mapping of command-line arguments to values.  If supplied, this
 *     is used to get certain command line parameters.  It can be generated from a package such as
 *     `optimist`, `yargs`, or `minimist`.
 *   @param {String} [options.environmentOverride] - This option overrides all other environment selection
 *     mechanisms.
 *   @param {String} [options.cliArgumentEnvironment='config-env'] - The command-line option used to
 *     determine the config environment.
 *   @param {String} [options.rootDir] - The project root directory containing package.json.  Normally
 *     auto-determined.
 *   @param {String} [options.envVariableEnvironment] - The name of the environment variable to use for
 *     getting the config environment name, instead of PROJECT_NAME_ENV.
 *   @param {String} [options.defaultEnvironment='local'] - The default name of the environment to use.
 *   @param {String} [options.defaultsFilename] - The filename of the defaults config file.  If not
 *     specified, uses projectname-defaults.conf
 *   @param {String} [options.filenameOverride] - Override the filename for the main config file.
 *   @param {String} [options.filename] - Filename of config file if not overridden by CLI or env variables.
 *     If not specified, defaults to projectname.conf
 *   @param {String} [options.cliArgumentFile] - The name of the command line argument to supply the
 *     config file path.  Defaults to 'c'
 *   @param {String} [options.envVariableFile] - The name of the environment variable to use to supply
 *     the config file path.  Defaults to PROJECT_NAME_CONFIG
 *   @param {String} [options.projectName] - Name of project to use.  Defaults to autodetect from package.json.
 */
export class LittleConf {
	options: LittleConfOptions;
	projectName?: string;
	environment?: string;
	rootDir?: string;

	constructor(options: LittleConfOptions = {}) {
		this.options = options;
	}

	/**
	 * Returns the value of a command-line argument given a name.
	 *
	 * @method _getCLIArgument
	 * @private
	 * @return {String|Undefined}
	 */
	_getCLIArgument(name: string): string | undefined {
		if (this.options.argv) {
			return this.options.argv[name];
		} else {
			return undefined;
		}
	}

	/**
	 * Determines the name of the config environment to use.
	 *
	 * @method _findConfigEnvironment
	 * @private
	 * @return {String}
	 */
	_findConfigEnvironment(): string {
		// If an environment override option is supplied, use that
		if (this.options.environmentOverride) {
			return this.options.environmentOverride;
		}
		// Check if the --config-env command-line argument is given
		let cliEnv: string | undefined = this._getCLIArgument(this.options.cliArgumentEnvironment || 'config-env');
		if (cliEnv) return cliEnv;
		// Check the environment variable corresponding to the project name (ie, PROJECT_NAME_ENV)
		let envVarName: string = this.options.envVariableEnvironment ||
			(this.getProjectName().toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_ENV');
		if (process.env[envVarName]) return process.env[envVarName];
		// Check the NODE_ENV environment variable
		if (process.env.NODE_ENV) return process.env.NODE_ENV;
		// Return the default environment
		return this.options.defaultEnvironment || 'local';
	}

	/**
	 * Determines the name of the project to use for config purposes.
	 *
	 * @method _findProjectName
	 * @private
	 * @return {String}
	 */
	_findProjectName(): string {
		let name: string;
		// Check project name option
		if (this.options.projectName) {
			name = this.options.projectName;
		} else {
			// Get it out of package.json
			let pkgPath: string = path.join(this.getProjectRootDir(), 'package.json');
			if (fs.existsSync(pkgPath)) {
				let pkg = JSON.parse(fs.readFileSync(pkgPath).toString('utf8'));
				if (pkg.name) name = pkg.name;
			}
		}
		if (!name) return 'project';
		// Strip out scope prefix if it exists
		let matchResult = /^@([-_A-Za-z0-9]+)\/([-_A-Za-z0-9]+)$/.exec(name);
		if (matchResult && matchResult[2]) name = matchResult[2];
		return name;
	}

	/**
	 * Determines the project's root directory that contains the package.json.
	 *
	 * @method _findProjectRootDir
	 * @private
	 * @return {String}
	 */
	_findProjectRootDir(): string {
		if (this.options.rootDir) return this.options.rootDir;

		let mainModuleDir = path.resolve(process.cwd());
		let dir = mainModuleDir;
		for (;;) {
			if (fs.existsSync(path.join(dir, 'package.json'))) {
				return dir;
			}
			let lastDir = dir;
			dir = path.resolve(dir, '..');
			if (dir === lastDir) break;
		}
		return mainModuleDir;
	}

	/**
	 * Returns the name of the project.
	 *
	 * @method getProjectName
	 * @return {String}
	 */
	getProjectName(): string {
		if (this.projectName) return this.projectName;
		this.projectName = this._findProjectName();
		return this.projectName;
	}

	/**
	 * Returns the name of the config environment to use.
	 *
	 * @method getConfigEnvironment
	 * @return {String}
	 */
	getConfigEnvironment(): string {
		if (this.environment) return this.environment;
		this.environment = this._findConfigEnvironment();
		return this.environment;
	}

	/**
	 * Returns the project's root directory (where package.json is).
	 *
	 * @method getProjectRootDir
	 * @return {String}
	 */
	getProjectRootDir(): string {
		if (this.rootDir) return this.rootDir;
		this.rootDir = this._findProjectRootDir();
		return this.rootDir;
	}

	/**
	 * Loads and returns a single config file.
	 *
	 * @method _loadFile
	 * @private
	 * @param {String} filename
	 * @return {Object}
	 */
	async _loadFile(filename: string): Promise<any> {
		if (!filename) return {};
		if (!fs.existsSync(filename)) return {};
		if (/\.js$/.test(filename)) {
			let m = await import(filename);
			return m.default;
		} else {
			let data = fs.readFileSync(filename);
			let result = yaml.safeLoad(data, 'utf8');
			if (typeof result !== 'object' || !result) return {};
			return result;
		}
	}

	_mergeConfig(...configs: any[]): any {
		let merged = objtools.merge({}, ...configs);
		// Iterate over the object and delete null values
		function removeNulls(obj: any): void {
			if (!obj || typeof obj !== 'object') return;
			for (let key in obj) {
				if (obj[key] === null) {
					delete obj[key];
				} else {
					removeNulls(obj[key]);
				}
			}
		}
		removeNulls(merged);
		return merged;
	}

	_resolvePath(filenames: string[] | string, searchPaths: string[] | string): string | null {
		let filenamesArray = filenames;
		if (!Array.isArray(filenamesArray)) filenamesArray = [ filenamesArray ];
		if (!Array.isArray(searchPaths)) searchPaths = [ searchPaths ];
		for (let searchPath of searchPaths) {
			for (let filename of filenamesArray) {
				let absolutePath = path.isAbsolute(filename) ? filename : path.resolve(searchPath, filename);
				if (fs.existsSync(absolutePath)) return absolutePath;
			}
		}
		return null;
	}

	/**
	 * Loads and evaluates the project's configuration.
	 *
	 * @method loadConfig
	 * @return {Object}
	 */
	async loadConfig(): Promise<any> {
		// Load the config defaults file
		let defaultsFilename: string | string[] | undefined = this.options.defaultsFilename;
		if (!defaultsFilename) {
			defaultsFilename = [
				this.getProjectName() + '-defaults.conf',
				this.getProjectName() + '-defaults.conf.js'
			];
		}
		defaultsFilename = this._resolvePath(defaultsFilename, this.getProjectRootDir());
		let defaultsConfig: any = await this._loadFile(defaultsFilename);


		// Load the main config file
		let mainFilename: string | string[] | undefined = this.options.filenameOverride;
		if (!mainFilename) {
			mainFilename = this._getCLIArgument(this.options.cliArgumentFile || 'c');
		}
		if (!mainFilename) {
			let envVar = this.options.envVariableFile ||
				(this.getProjectName().toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_CONFIG');
			mainFilename = process.env[envVar];
		}
		if (!mainFilename) {
			mainFilename = this.options.filename;
		}
		if (!mainFilename) {
			mainFilename = [
				this.getProjectName() + '.conf',
				this.getProjectName() + '.conf.js'
			];
		}
		const configSearchPaths: string[] = [ this.getProjectRootDir(), '/etc' ];
		mainFilename = this._resolvePath(mainFilename, configSearchPaths);
		let mainConfig: any = mainFilename ? (await this._loadFile(mainFilename)) : {};

		// Find environment variable config option overrides
		let overrides = {};
		let overrideEnvPrefix = this.getProjectName().toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_CONFIG_';
		let overrideEnvRegex = new RegExp('^' + overrideEnvPrefix + '(.*)$');
		for (let key in process.env) {
			let rex = overrideEnvRegex.exec(key);
			if (rex) {
				objtools.setPath(overrides, rex[1], process.env[key]);
			}
		}

		// Find command line config option overrides
		for (let key in (this.options.argv || {})) {
			let rex = /^config-setting-(.*)$/.exec(key);
			if (rex) {
				objtools.setPath(overrides, rex[1], this.options.argv[key]);
			}
		}

		// Merge the configs together
		let env: string = this.getConfigEnvironment();
		let merged = this._mergeConfig(
			defaultsConfig,
			objtools.getPath(defaultsConfig, 'environments.' + env) || {},
			mainConfig,
			objtools.getPath(mainConfig, 'environments.' + env) || {},
			overrides
		);
		delete merged.environments;

		return merged;
	}

}


