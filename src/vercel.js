const core = require('@actions/core')
const got = require('got')
const { exec, removeSchema } = require('./helpers')

const {
	VERCEL_TOKEN,
	VERCEL_PATH,
	PRODUCTION,
	VERCEL_SCOPE,
	VERCEL_ORG_ID,
	VERCEL_PROJECT_ID,
	SHA,
	USER,
	REPOSITORY,
	REF,
	TRIM_COMMIT_MESSAGE,
	BUILD_ENV,
	PREBUILT,
	WORKING_DIRECTORY,
	FORCE
} = require('./config')

const init = async () => {
	core.info('Setting environment variables for Vercel CLI')
	core.exportVariable('VERCEL_ORG_ID', VERCEL_ORG_ID)
	core.exportVariable('VERCEL_PROJECT_ID', VERCEL_PROJECT_ID)

	let deploymentUrl
	
	core.startGroup('Installing Vercel CLI');
	await exec('npm', ['install', '-g', 'vercel'], WORKING_DIRECTORY);
	core.endGroup();

	// Log current working directory
        core.startGroup('Current Working Directory');
        const pwdOutput = await exec('pwd', [], WORKING_DIRECTORY);
        core.info(`Current working directory: ${pwdOutput}`);
        
        // Also list directory contents for debugging
        const lsOutput = await exec('ls', ['-la'], WORKING_DIRECTORY);
        core.info('Directory contents:');
        core.info(lsOutput);
        core.endGroup();
	const deploy = async (commit) => {
		let commandArguments = [`--cwd=${ VERCEL_PATH }` ]

		commandArguments.push(`--token=${ VERCEL_TOKEN }`)
		commandArguments.push(`--debug`)
		// commandArguments.push(`--yes`)

		if (VERCEL_SCOPE) {
			commandArguments.push(`--scope=${ VERCEL_SCOPE }`)
		}

		if (PRODUCTION) {
			commandArguments.push('--prod')
		}

		if (PREBUILT) {
			commandArguments.push('--prebuilt')
		}

		if (FORCE) {
			commandArguments.push('--force')
		}

		if (commit && false) {
			const metadata = [
				`githubCommitAuthorName=${ commit.authorName }`,
				`githubCommitAuthorLogin=${ commit.authorLogin }`,
				`githubCommitMessage=${ TRIM_COMMIT_MESSAGE ? commit.commitMessage.split(/\r?\n/)[0] : commit.commitMessage }`,
				`githubCommitOrg=${ USER }`,
				`githubCommitRepo=${ REPOSITORY }`,
				`githubCommitRef=${ REF }`,
				`githubCommitSha=${ SHA }`,
				`githubOrg=${ USER }`,
				`githubRepo=${ REPOSITORY }`,
				`githubDeployment=1`
			]

			metadata.forEach((item) => {
				commandArguments = commandArguments.concat([ '--meta', item ])
			})
		}

		if (BUILD_ENV) {
			BUILD_ENV.forEach((item) => {
				commandArguments = commandArguments.concat([ '--build-env', item ])
			})
		}
		
		core.info('Starting deploy with Vercel CLI')
		const output = await exec('vercel', commandArguments, WORKING_DIRECTORY)
		const parsed = output.match(/(?<=https?:\/\/)(.*)/g)[0]

		if (!parsed) throw new Error('Could not parse deploymentUrl')

		deploymentUrl = parsed

		return deploymentUrl
	}

	const assignAlias = async (aliasUrl) => {
		const commandArguments = [ `--token=${ VERCEL_TOKEN }`, 'alias', 'set', deploymentUrl, removeSchema(aliasUrl) ]

		if (VERCEL_SCOPE) {
			commandArguments.push(`--scope=${ VERCEL_SCOPE }`)
		}

		const output = await exec('vercel', commandArguments, WORKING_DIRECTORY)

		return output
	}

	const getDeployment = async () => {
		const url = `https://api.vercel.com/v11/now/deployments/get?url=${ deploymentUrl }`
		const options = {
			headers: {
				Authorization: `Bearer ${ VERCEL_TOKEN }`
			}
		}

		const res = await got(url, options).json()

		return res
	}

	return {
		deploy,
		assignAlias,
		deploymentUrl,
		getDeployment
	}
}

function executeVercelCommand(commandArguments, workingDirectory) {
    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        const child = spawn('vercel', commandArguments, {
            cwd: workingDirectory,
            shell: true
        });

        // Capture stdout
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        // Capture stderr
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Handle process errors (e.g., command not found, permission denied)
        child.on('error', (error) => {
            error.stdout = stdout;
            error.stderr = stderr;
            error.cmd = `vercel ${commandArguments.join(' ')}`;
            error.workingDirectory = workingDirectory;
            reject(error);
        });

        // Handle process completion
        child.on('close', (code) => {
            if (code !== 0) {
                const error = new Error('Vercel CLI command failed');
                error.code = code;
                error.stdout = stdout;
                error.stderr = stderr;
                error.cmd = `vercel ${commandArguments.join(' ')}`;
                error.workingDirectory = workingDirectory;
                reject(error);
            } else {
                resolve({
                    success: true,
                    stdout,
                    stderr,
                    code
                });
            }
        });
    });
}


module.exports = {
	init
}
