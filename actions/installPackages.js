const fs = require("fs");
const pathModule = require("path");
const { exec } = require("child_process");

// Main action function to install missing packages
async function installPackages(projectName, generatedCode) {
  try {
    const projectDir = getProjectDirectory(projectName);
    const packageJsonPath = pathModule.join(projectDir, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      throw new Error("package.json not found in the project directory.");
    }

    // Read and parse the package.json file
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);

    // Determine which packages are referenced in the generated code
    const usedPackages = parsePackagesFromCode(generatedCode);

    // Identify missing packages by comparing with dependencies in package.json
    const missingPackages = usedPackages.filter((pkg) => {
      return (
        !(packageJson.dependencies && packageJson.dependencies[pkg]) &&
        !(packageJson.devDependencies && packageJson.devDependencies[pkg])
      );
    });

    if (missingPackages.length === 0) {
      console.log("No new packages to install.");
      return { installed: [] };
    }

    // Install each missing package
    for (const pkg of missingPackages) {
      console.log(`Installing ${pkg}...`);
      await runCommand(`npm install ${pkg} --save`, projectDir);
    }

    return { installed: missingPackages };
  } catch (error) {
    console.error("Error installing packages:", error);
    return { error: error.message };
  }
}

// Helper: Executes a shell command in the specified directory
function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${command}\n`, stderr);
        return reject(error);
      }
      resolve(stdout);
    });
  });
}

// Helper: Parses package names from the generated code using simple regex matching
function parsePackagesFromCode(code) {
  const packages = new Set();
  // Regex matches both ES module imports and CommonJS requires
  const importRegex =
    /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"])|(?:require\(['"]([^'"]+)['"]\))/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const pkg = match[1] || match[2];
    // Exclude relative paths
    if (pkg && !pkg.startsWith(".") && !pkg.startsWith("/")) {
      packages.add(pkg);
    }
  }
  return Array.from(packages);
}

// Utility: Retrieves the base directory of a project (assuming projects folder is in the repository root)
function getProjectDirectory(projectName) {
  return pathModule.join(process.cwd(), "projects", projectName);
}

module.exports = installPackages;
