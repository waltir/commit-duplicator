const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');
const _ = require('lodash');

// Check if the --help parameter is provided
const shouldShowHelp = process.argv.includes('--help');

if (shouldShowHelp) {
    console.log("Usage: node commit-duplicator.js --sourceDir=<source directory> --newDir=<new directory>");
    console.log('Options:');
    console.log('  --sourceDir    Specify the source directory containing the commits');
    console.log('  --newDir       Specify the new directory where the commits will be duplicated');
    console.log('  --watch        Enable watching for new commits (optional)');
    console.log('  --help         Reveal all possible parameters');
    process.exit(0);
}

// Get the sourceDir and newDir from the command-line arguments
const sourceDirArg = process.argv.find(arg => arg.startsWith('--sourceDir='));
const newDirArg = process.argv.find(arg => arg.startsWith('--newDir='));
const watchArg = process.argv.includes('--watch');

// Check if the sourceDir argument is provided
if (!sourceDirArg) {
    console.error('Error: --sourceDir parameter is missing.');
    process.exit(1);
}

// Check if the newDir argument is provided
if (!newDirArg) {
    console.error('Error: --newDir parameter is missing.');
    process.exit(1);
}

// Extract the sourceDir and newDir values
let sourceDir = sourceDirArg.split('=')[1];
let newDir = newDirArg.split('=')[1];

// Convert sourceDir to absolute path if it is a relative path
if (!path.isAbsolute(sourceDir)) {
    sourceDir = path.resolve(process.cwd(), sourceDir);
}

// Convert newDir to absolute path if it is a relative path
if (!path.isAbsolute(newDir)) {
    newDir = path.resolve(process.cwd(), newDir);
}

// Array to keep track of processed commit hashes
const processedCommits = [];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// Check to see if the newDir contains a .git directory and if not execute a "git init"
async function checkAndInitGitRepository(directoryPath) {
    const gitDirPath = `${directoryPath}/.git`;
    if (!fs.existsSync(gitDirPath)) {
        await process.chdir(directoryPath);
        await sleep(1000);
        await execSync(`git init`)
        await console.error('Git repository does not exist in the specified directory.');
    }
}

// Add a new commit to the newFir once a change has been made
async function addCommitToGitFile(directoryPath, filePath, commitMessage) {
    try {
        // Change to the specified directory
        await process.chdir(directoryPath);

        // Check if the file exists
        await fs.access(filePath, fs.constants.F_OK, async (error) => {
            if (error) {
                console.error(`File '${filePath}' does not exist.`);
                return;
            }

            // Stage the file
            await execSync(`git add ${directoryPath}/${filePath}`);

            // Commit the changes
            await execSync(`git commit -m "${commitMessage}"`);

            await console.log('Git commit created successfully.');

            return true;
        });
    } catch (error) {
        console.error('Failed to change directory:', error);
    }
}


//
async function getCommitDetails(commitHash) {
    try {
        // Get the commit message
        const commitMessage = execSync(`git log --format=%B -n 1 ${commitHash}`).toString().trim();

        // Get the commit author
        const commitAuthor = execSync(`git log --format=%an -n 1 ${commitHash}`).toString().trim();

        // Get the commit date
        const commitDate = execSync(`git log --format=%ad -n 1 ${commitHash}`).toString().trim();

        return {commitMessage, commitAuthor, commitDate};
    } catch (error) {
        console.error('Failed to retrieve commit details:', error);
        return null;
    }
}


let newCommitsToCommit = [];

// Function to check for new commits
async function checkNewCommits() {
    try {
        // Change the current working directory to sourceDir
        await process.chdir(sourceDir);

        // Get the last pushed commit hash of the main branch
        const lastPushedCommit = await execSync('git rev-parse origin/main').toString().trim();

        // Get the current commit hash of the local main branch
        const currentCommit = await execSync('git rev-parse main').toString().trim();

        // Get the list of new commits
        const commitHashes = await execSync(`git rev-list ${lastPushedCommit}..${currentCommit}`).toString().trim().split('\n');
        const newCommits = await commitHashes.filter(hash => hash !== '');

        console.log(`\n${newCommits.length} Staged Commits`, newCommits, "\n");

        // Iterate over each new commit
        for await (const commitHash of newCommits) {

            await process.chdir(sourceDir);

            await sleep(1000);

            // Skip if the commit hash has already been processed
            if (processedCommits.includes(commitHash)) {
                continue;
            }
            await sleep(1000);

            // Retrieve the commit details
            let commitDetails = await getCommitDetails(commitHash);

            // Skip if failed to retrieve commit details
            if (!commitDetails) {
                continue;
            }

            // Destructure the commit detailsx
            const {commitMessage, commitAuthor, commitDate} = commitDetails;


            // Create the commit details string
            const commitDetailLog = `Commit Hash: ${commitHash}\nCommit Message: ${commitMessage}\nAuthor: ${commitAuthor}\nCommit Date: ${commitDate}\n---\n`;

            // Create the relative path of the source file within the sourceDir
            const relativeFilePath = await execSync(`git log --format=%n --name-only -n 1 ${commitHash}`).toString().trim();

            // Get the filename from the relative path
            const fileName = path.basename(relativeFilePath);

            // Create the new file path in the newDir directory
            const newFilePath = await path.join(newDir, fileName);

            // Check if the file already exists
            if (fs.existsSync(newFilePath)) {

                // Read the existing file contents
                const fileContents = await fs.readFileSync(newFilePath, 'utf8');

                // Check if the commit hash already exists in the file
                if (fileContents.includes(commitHash)) {
                    // Skip if the commit hash is already present in the file
                    continue;
                }

                // Append the commit details to the existing file
                await fs.appendFileSync(newFilePath, commitDetailLog);
            } else {
                // Create a new file and write the commit details
                await fs.writeFileSync(newFilePath, commitDetailLog);
            }

            // Log the commit details to the console
            await console.log(`${commitDate} | ${fileName} - ${commitMessage}`);

            // Stage and commit the new changes
            await addCommitToGitFile(newDir, fileName, commitMessage);

            await sleep(1000);

            // Push successful commits to the array to be logged at the end of the run
            await newCommitsToCommit.push({
                fileName: fileName,
                commitMessage: commitMessage
            });

            // Add the processed commit hash to the list
            await processedCommits.push(commitHash);
        }
    } catch (error) {
        console.error(`Error occurred while checking new commits: ${error.message}`);
    }
}

async function run() {
    // Initialize git in the newDir repo if not already done
    await checkAndInitGitRepository(newDir);
    // Sleep for one second
    await sleep(1000);
    // Call the function to check for new commits
    await checkNewCommits();
    // Sleep for one second
    await sleep(1000);
    // Log the final
    await console.log(`\n${newCommitsToCommit.length} New Commits Added`, newCommitsToCommit, '\n')
}


(async () => {
    // Watch for changes to the sourceDir
    if (watchArg) {
        const directory = `${sourceDir}/.git`;
        let logMessage = async () => {
            return console.log(`Change detected in ${directory}.`)
        }

        // Add a debounce mechanism to limit the frequency of execution
        const debounceCheckNewCommits = _.debounce(run, 1000);
        const debounceMessage = _.debounce(logMessage, 1000);

        // Check for new commits whenever a change is made
        fs.watch(directory, { recursive: true }, (event, filename) => {
            debounceMessage();
            debounceCheckNewCommits();
        });
        console.log(`\nWatching for changes in ${directory}. Press Ctrl+C to stop.\n`);

    } else {
        run();
    }
})().catch(err => {
    console.error(err);
});