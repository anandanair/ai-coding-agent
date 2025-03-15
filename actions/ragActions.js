// ragActions.js
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { QdrantClient } = require("@qdrant/js-client-rest");
const { v5: uuidv5 } = require("uuid");

const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

// Create a Qdrant client instance (adjust the URL if needed)
const qdrantClient = new QdrantClient({ url: "http://localhost:6333" });

const excludedDirs = new Set([
  "node_modules",
  "memory",
  "dist",
  "build",
  "coverage",
  ".git",
]);

const excludedFiles = new Set([
  ".gitignore",
  "package-lock.json",
  "yarn.lock",
  ".env",
  ".env.local",
  ".DS_Store",
]);

const excludedExtensions = new Set([
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".log",
  ".lock",
  ".zip",
  ".tar",
  ".gz",
  ".pdf",
  ".docx",
  ".xlsx",
]);

// Recursively get all files in the project directory
function getAllFiles(dir, files = [], projectRoot = dir) {
  // Define exclusion criteria

  const items = fs.readdirSync(dir);

  items.forEach((item) => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    const relativePath = path.relative(projectRoot, fullPath);

    if (stat.isDirectory()) {
      if (excludedDirs.has(item)) return;
      getAllFiles(fullPath, files);
    } else {
      // Check if file should be excluded
      const shouldExclude =
        excludedFiles.has(item) ||
        excludedExtensions.has(path.extname(item)) ||
        relativePath === "public/vite.svg";

      if (!shouldExclude) {
        files.push(fullPath);
      }
    }
  });
  return files;
}

// Function to index project files with RAG
async function initializeProjectRAG(projectName, projectPath) {
  // Generate metadata first
  const metadata = await generateProjectMetadata(projectPath);

  // Create metadata collection
  const metaCollection = `meta_${projectName}`;
  await ensureCollectionExists(metaCollection);

  // Index metadata
  const metaPoint = {
    id: uuidv5("metadata", NAMESPACE),
    vector: await getEmbedding(JSON.stringify(metadata)),
    payload: {
      type: "project_architecture",
      metadata,
    },
  };
  await upsertPoint(metaCollection, metaPoint);

  const files = getAllFiles(projectPath);
  const collectionName = `project_${projectName}`;

  // Ensure the Qdrant collection exists for this project
  await ensureCollectionExists(collectionName);

  // You can add file type filtering if needed
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const chunks = chunkFile(content);

      for (const [index, chunk] of chunks.entries()) {
        const response = await axios.post("http://localhost:8000/embedding", {
          text: chunk,
        });

        const point = {
          id: uuidv5(`${file}_${index}`, NAMESPACE),
          vector: response.data.embedding,
          payload: {
            filePath: file,
            snippet: chunk,
            chunkIndex: index,
          },
        };

        await upsertPoint(collectionName, point);
      }

      console.log(`Indexed ${file} for project ${projectName}`);
    } catch (error) {
      console.error(`Error indexing ${file}:`, error);
    }
  }
  console.log("RAG initialization complete for project:", projectName);
}

// Helper function to ensure a collection exists (creates one if not)
async function ensureCollectionExists(collectionName) {
  try {
    const response = await qdrantClient.collectionExists(collectionName);
    if (response.exists) {
      console.log(`Collection "${collectionName}" exists.`);
    } else {
      // Create the collection if it doesn't exist.
      await qdrantClient.createCollection(collectionName, {
        vectors: { size: 384, distance: "Cosine" },
      });
      console.log(`Created collection "${collectionName}".`);
    }
  } catch (error) {
    console.error("Error ensuring collection exists:", error);
    throw error;
  }
}

// Helper function to upsert a point into Qdrant
async function upsertPoint(collectionName, point) {
  try {
    const response = await qdrantClient.upsert(collectionName, {
      points: [point],
    });
    return response;
  } catch (error) {
    console.error(
      "Error upserting point to Qdrant:",
      error.response?.data || error
    );
    throw error;
  }
}

async function deleteQdrantCollection(collectionName) {
  try {
    await qdrantClient.deleteCollection(collectionName);
    console.log(`Deleted collection "${collectionName}".`);
  } catch (error) {
    console.error(
      `Error deleting Qdrant collection "${collectionName}":`,
      error.response?.data || error
    );
  }
}

// In initializeProjectRAG function
function chunkFile(content) {
  const MAX_CHUNK_SIZE = 512;
  const lines = content.split("\n");
  const chunks = [];
  let currentChunk = [];

  lines.forEach((line) => {
    if (currentChunk.join("\n").length + line.length > MAX_CHUNK_SIZE) {
      chunks.push(currentChunk.join("\n"));
      currentChunk = [];
    }
    currentChunk.push(line);
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n"));
  }
  return chunks;
}

async function searchProjectVectors(projectName, embedding) {
  try {
    const codeResults = await qdrantClient.search(`project_${projectName}`, {
      vector: embedding,
      limit: 2,
      with_payload: true,
    });
    return formatResults(codeResults);
  } catch (error) {
    console.error("Vector search failed:", error);
    return null;
  }
}

async function searchProjectMetadata(projectName, embedding) {
  const metaCollection = `meta_${projectName}`;
  try {
    const metaResults = await qdrantClient.search(metaCollection, {
      vector: embedding,
      limit: 1, // Assuming there's a single metadata point per project
      with_payload: true,
    });

    if (!metaResults || metaResults.length === 0) {
      console.warn(`No metadata found for project: ${projectName}`);
      return null;
    }

    // Return only the metadata portion of the payload
    return metaResults[0].payload.metadata;
  } catch (error) {
    console.error("Error searching metadata in Qdrant:", error);
    return null;
  }
}

async function generateProjectMetadata(projectPath) {
  const metadata = {
    structure: buildProjectTree(projectPath),
    components: [],
    routes: [],
    stateManagement: null,
    styling: [],
    apis: [],
    configFiles: [],
    packageInfo: {},
  };

  // Get all files in the project
  const files = getAllFiles(projectPath);
  files.forEach((file) => {
    const content = fs.readFileSync(file, "utf-8");
    const relativePath = path.relative(projectPath, file);

    // Identify components
    if (file.endsWith(".jsx") || file.endsWith(".tsx")) {
      const componentName = path.basename(file, path.extname(file));
      metadata.components.push({
        name: componentName,
        file: relativePath,
        props: extractProps(content),
        // Optionally, add other details like hooks usage here.
      });
    }
    // Identify styling files
    else if (file.endsWith(".css") || file.endsWith(".scss")) {
      metadata.styling.push(relativePath);
    }
    // Extract package info from package.json
    else if (relativePath === "package.json") {
      try {
        const pkg = JSON.parse(content);
        metadata.packageInfo = {
          dependencies: pkg.dependencies,
          devDependencies: pkg.devDependencies,
          scripts: pkg.scripts,
        };
      } catch (err) {
        console.error("Error parsing package.json", err);
      }
    }
    // Identify routes (you may later replace this with an AST parser for more accuracy)
    else if (/react-router/.test(content) || relativePath.includes("routes")) {
      const routesMatch = content.match(/path\s*=\s*["']([^"']+)["']/g);
      if (routesMatch) {
        const extractedRoutes = routesMatch.map((r) => r.split(/["']/)[1]);
        metadata.routes.push(...extractedRoutes);
      }
    }
    // Identify potential API calls
    else if (/axios|fetch/.test(content)) {
      metadata.apis.push(relativePath);
    }
    // Identify config files by name patterns (customize as needed)
    else if (
      file.endsWith(".json") &&
      (relativePath.includes("config") || relativePath.includes("settings"))
    ) {
      metadata.configFiles.push(relativePath);
    }
  });

  // Remove duplicate routes if any
  metadata.routes = Array.from(new Set(metadata.routes));

  // Write the detailed metadata to a JSON file in the memory folder
  const metadataPath = path.join(
    projectPath,
    "memory",
    "project-metadata.json"
  );
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  return metadata;
}

// Recursively build a tree representation of the project structure
function buildProjectTree(dir, projectRoot = dir) {
  const tree = { name: path.basename(dir), children: [] };
  const items = fs.readdirSync(dir);

  items.forEach((item) => {
    const fullPath = path.join(dir, item);
    const relativePath = path.relative(projectRoot, fullPath);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (excludedDirs.has(item)) return;
      // Recursively build tree for subdirectories
      tree.children.push(buildProjectTree(fullPath, projectRoot));
    } else {
      const ext = path.extname(item);
      const shouldExclude =
        excludedFiles.has(item) ||
        excludedExtensions.has(ext) ||
        relativePath === "public/vite.svg";
      if (!shouldExclude) {
        tree.children.push({ name: item });
      }
    }
  });

  return tree;
}

function formatResults(items) {
  return items
    .map((item) => {
      if (item.payload.type === "project_architecture") {
        return `ARCHITECTURE:
        Components: ${item.payload.metadata.components
          .map((c) => c.name)
          .join(", ")}
        Routes: ${item.payload.metadata.routes.join(", ")}
        State: ${item.payload.metadata.stateManagement || "Not detected"}`;
      }
      return `CODE: ${item.payload.filePath}\n${item.payload.snippet}`;
    })
    .join("\n\n");
}

async function getEmbedding(text) {
  const response = await axios.post("http://localhost:8000/embedding", {
    text,
  });
  return response.data.embedding;
}

function extractProps(content) {
  // Simple prop-type extraction
  const propsMatch = content.match(/propTypes\s*=\s*{([^}]+)}/);
  return propsMatch
    ? propsMatch[1].split(",").map((p) => p.split(":")[0].trim())
    : [];
}

module.exports = {
  initializeProjectRAG,
  deleteQdrantCollection,
  searchProjectVectors,
  searchProjectMetadata,
  qdrantClient,
};
