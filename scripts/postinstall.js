const { spawnSync } = require('child_process');

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        stdio: 'inherit',
        shell: false,
        ...options,
    });

    if (result.error) {
        return { ok: false, error: result.error };
    }

    return { ok: result.status === 0, status: result.status };
}

function hasCommand(command, args = ['--version']) {
    const result = spawnSync(command, args, { stdio: 'ignore', shell: false });
    return !result.error && result.status === 0;
}

function installLinuxSystemLibraries() {
    if (process.platform !== 'linux') {
        return;
    }

    if (!hasCommand('apt-get')) {
        console.warn('[postinstall] apt-get not available, skipping Linux system packages');
        return;
    }

    console.log('[postinstall] Installing Linux system libraries for face detection');

    const updateResult = run('apt-get', ['update']);
    if (!updateResult.ok) {
        throw new Error('apt-get update failed');
    }

    const installResult = run('apt-get', [
        'install',
        '-y',
        '--no-install-recommends',
        'libgl1',
        'libglib2.0-0',
    ]);
    if (!installResult.ok) {
        throw new Error('apt-get install failed');
    }
}

function installPythonRequirements() {
    const pipArgs = [
        '-m',
        'pip',
        'install',
        '--no-cache-dir',
        '--extra-index-url',
        'https://download.pytorch.org/whl/cpu',
        '-r',
        'requirements-web.txt',
    ];

    const pythonCommands = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];

    for (const pythonCommand of pythonCommands) {
        if (!hasCommand(pythonCommand)) {
            continue;
        }

        console.log(`[postinstall] Installing Python requirements with ${pythonCommand}`);
        const result = run(pythonCommand, pipArgs);
        if (result.ok) {
            return;
        }
    }

    throw new Error('Unable to install Python requirements');
}

try {
    installLinuxSystemLibraries();
    installPythonRequirements();
} catch (error) {
    console.error('[postinstall] Failed:', error.message);
    process.exit(1);
}