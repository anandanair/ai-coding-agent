// ragActions.js
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { QdrantClient } = require("@qdrant/js-client-rest");
const { v5: uuidv5 } = require("uuid");

const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

// Create a Qdrant client instance (adjust the URL if needed)
const qdrantClient = new QdrantClient({ url: "http://localhost:6333" });

// Recursively get all files in the project directory
function getAllFiles(dir, files = [], projectRoot = dir) {
  // Define exclusion criteria
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
    // Images
    ".svg",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    // Non-code files
    ".log",
    ".lock",
    ".zip",
    ".tar",
    ".gz",
    // Documents
    ".pdf",
    ".docx",
    ".xlsx",
  ]);
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
  // Search metadata first
  const metaResults = await qdrantClient.search(`meta_${projectName}`, {
    vector: embedding,
    limit: 3,
    with_payload: true,
  });

  try {
    const codeResults = await qdrantClient.search(`project_${projectName}`, {
      vector: embedding,
      limit: 2,
      with_payload: true,
    });

    return formatResults([...metaResults, ...codeResults]);
  } catch (error) {
    console.error("Vector search failed:", error);
    return null;
  }
}

async function generateProjectMetadata(projectPath) {
  const metadata = {
    components: [],
    routes: [],
    stateManagement: null,
    styling: [],
    apis: [],
  };

  // Analyze project files
  const files = getAllFiles(projectPath);

  files.forEach((file) => {
    const content = fs.readFileSync(file, "utf-8");

    // Simple component detection
    if (file.endsWith(".jsx") || file.endsWith(".tsx")) {
      const componentName = path.basename(file, path.extname(file));
      metadata.components.push({
        name: componentName,
        file: path.relative(projectPath, file),
        props: extractProps(content), // Implement this function
      });
    }

    // Route detection (simplified)
    if (file.includes("App.jsx") || file.includes("routes.js")) {
      const routes = content.match(/path="([^"]+)/g);
      if (routes) metadata.routes = routes.map((r) => r.split('"')[1]);
    }
  });

  const metadataPath = path.join(
    projectPath,
    "memory",
    "project-metadata.json"
  );
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  return metadata;
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
};
