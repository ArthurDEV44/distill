/**
 * Project Detector
 *
 * Detects the type of project in the current working directory.
 */

import { existsSync, readFileSync } from "fs";
import { join, basename } from "path";

export interface ProjectInfo {
  rootPath: string;
  name: string;
  type: "node" | "python" | "rust" | "go" | "unknown";
  packageManager?: "npm" | "yarn" | "pnpm" | "bun";
  hasTypeScript: boolean;
  detectedAt: Date;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function detectProject(rootPath: string = process.cwd()): ProjectInfo | null {
  // Try to detect project type based on config files
  const projectInfo: ProjectInfo = {
    rootPath,
    name: basename(rootPath),
    type: "unknown",
    hasTypeScript: false,
    detectedAt: new Date(),
  };

  // Check for Node.js project
  const packageJsonPath = join(rootPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson: PackageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      projectInfo.name = packageJson.name || projectInfo.name;
      projectInfo.type = "node";

      // Check for TypeScript
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      projectInfo.hasTypeScript = "typescript" in deps || existsSync(join(rootPath, "tsconfig.json"));

      // Detect package manager
      if (existsSync(join(rootPath, "bun.lockb")) || existsSync(join(rootPath, "bun.lock"))) {
        projectInfo.packageManager = "bun";
      } else if (existsSync(join(rootPath, "pnpm-lock.yaml"))) {
        projectInfo.packageManager = "pnpm";
      } else if (existsSync(join(rootPath, "yarn.lock"))) {
        projectInfo.packageManager = "yarn";
      } else if (existsSync(join(rootPath, "package-lock.json"))) {
        projectInfo.packageManager = "npm";
      }

      return projectInfo;
    } catch {
      // Invalid package.json, continue checking other types
    }
  }

  // Check for Python project
  if (
    existsSync(join(rootPath, "pyproject.toml")) ||
    existsSync(join(rootPath, "setup.py")) ||
    existsSync(join(rootPath, "requirements.txt"))
  ) {
    projectInfo.type = "python";

    // Try to get project name from pyproject.toml
    const pyprojectPath = join(rootPath, "pyproject.toml");
    if (existsSync(pyprojectPath)) {
      try {
        const content = readFileSync(pyprojectPath, "utf-8");
        const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
        if (nameMatch?.[1]) {
          projectInfo.name = nameMatch[1];
        }
      } catch {
        // Ignore parsing errors
      }
    }

    return projectInfo;
  }

  // Check for Rust project
  if (existsSync(join(rootPath, "Cargo.toml"))) {
    projectInfo.type = "rust";

    try {
      const cargoToml = readFileSync(join(rootPath, "Cargo.toml"), "utf-8");
      const nameMatch = cargoToml.match(/name\s*=\s*["']([^"']+)["']/);
      if (nameMatch?.[1]) {
        projectInfo.name = nameMatch[1];
      }
    } catch {
      // Ignore parsing errors
    }

    return projectInfo;
  }

  // Check for Go project
  if (existsSync(join(rootPath, "go.mod"))) {
    projectInfo.type = "go";

    try {
      const goMod = readFileSync(join(rootPath, "go.mod"), "utf-8");
      const moduleMatch = goMod.match(/module\s+(\S+)/);
      if (moduleMatch?.[1]) {
        const modulePath = moduleMatch[1];
        projectInfo.name = modulePath.split("/").pop() ?? modulePath;
      }
    } catch {
      // Ignore parsing errors
    }

    return projectInfo;
  }

  // If we found any config files but couldn't determine type
  if (
    existsSync(join(rootPath, ".git")) ||
    existsSync(join(rootPath, "README.md")) ||
    existsSync(join(rootPath, "Makefile"))
  ) {
    return projectInfo;
  }

  // No project detected
  return null;
}

export function getProjectSummary(project: ProjectInfo | null): string {
  if (!project) {
    return "No project detected in current directory.";
  }

  const parts = [`**${project.name}** (${project.type})`];

  if (project.packageManager) {
    parts.push(`Package Manager: ${project.packageManager}`);
  }

  if (project.hasTypeScript) {
    parts.push("TypeScript enabled");
  }

  return parts.join(" | ");
}
