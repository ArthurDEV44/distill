import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    ignores: [".source/**"],
  },
  {
    files: ["**/*.tsx"],
    rules: {
      // Allow react-three-fiber props (position, args, transparent, etc.)
      "react/no-unknown-property": [
        "warn",
        {
          ignore: [
            "args",
            "attach",
            "position",
            "rotation",
            "transparent",
            "blending",
            "depthWrite",
            "sizeAttenuation",
            "vertexShader",
            "fragmentShader",
            "uniforms",
          ],
        },
      ],
    },
  },
];
