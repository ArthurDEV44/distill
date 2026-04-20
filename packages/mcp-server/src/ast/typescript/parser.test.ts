/**
 * TypeScript AST Parser Tests
 *
 * Direct unit tests for parseTypeScript. Covers complex TypeScript syntax that
 * may not be exercised through integration tests: generics, decorators,
 * namespaces, conditional types, overloaded signatures, satisfies, computed
 * property names, ambient declarations, module-level arrow functions, and
 * re-exports.
 */

import { describe, it, expect } from "vitest";
import { parseTypeScript } from "./parser.js";
import type { CodeElement } from "../types.js";

function parse(src: string) {
  return parseTypeScript(src, true);
}

function findByName(
  elements: CodeElement[],
  name: string
): CodeElement | undefined {
  return elements.find((e) => e.name === name);
}

describe("parseTypeScript — function declarations", () => {
  it("extracts a simple function declaration", () => {
    const out = parse(`function greet(name: string): string { return name; }`);
    const fn = findByName(out.functions, "greet");
    expect(fn).toBeDefined();
    expect(fn?.type).toBe("function");
    expect(fn?.returnType).toBe("string");
    expect(fn?.parameters?.[0]?.name).toBe("name");
  });

  it("marks async functions correctly", () => {
    const out = parse(`async function load(): Promise<void> { }`);
    const fn = findByName(out.functions, "load");
    expect(fn?.isAsync).toBe(true);
    expect(fn?.returnType).toBe("Promise<void>");
  });

  it("marks exported functions", () => {
    const out = parse(`export function publicFn(): number { return 1; }`);
    const fn = findByName(out.functions, "publicFn");
    expect(fn?.isExported).toBe(true);
  });

  it("captures JSDoc on a function", () => {
    const out = parse(`/** Adds two numbers */\nfunction add(a: number, b: number): number { return a + b; }`);
    const fn = findByName(out.functions, "add");
    expect(fn?.documentation).toContain("Adds two numbers");
  });
});

describe("parseTypeScript — generics", () => {
  it("extracts single type parameter", () => {
    const out = parse(`function identity<T>(x: T): T { return x; }`);
    const fn = findByName(out.functions, "identity");
    expect(fn?.generics).toEqual(["T"]);
    expect(fn?.signature).toContain("<T>");
  });

  it("extracts constrained type parameter (T extends Foo)", () => {
    const out = parse(
      `interface Foo { id: number } function pick<T extends Foo>(x: T): T { return x; }`
    );
    const fn = findByName(out.functions, "pick");
    expect(fn?.generics?.[0]).toContain("T extends Foo");
  });

  it("extracts multiple type parameters with constraints", () => {
    const out = parse(
      `function get<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }`
    );
    const fn = findByName(out.functions, "get");
    expect(fn?.generics).toHaveLength(2);
    expect(fn?.generics?.[1]).toContain("K extends keyof T");
  });

  it("generics appear in the function signature", () => {
    const out = parse(
      `function get<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }`
    );
    const fn = findByName(out.functions, "get");
    expect(fn?.signature).toContain("<T, K extends keyof T>");
  });

  it("extracts generics on classes", () => {
    const out = parse(`class Box<T> { value!: T }`);
    const cls = findByName(out.classes, "Box");
    expect(cls?.generics).toEqual(["T"]);
    expect(cls?.signature).toContain("Box<T>");
  });

  it("extracts generics on interfaces", () => {
    const out = parse(`interface Repo<T, ID = string> { find(id: ID): T }`);
    const iface = findByName(out.interfaces, "Repo");
    expect(iface?.generics).toHaveLength(2);
    expect(iface?.generics?.[1]).toContain("ID = string");
  });

  it("extracts generics with default values", () => {
    const out = parse(`type Result<T = unknown, E = Error> = { ok: T } | { err: E }`);
    const typ = findByName(out.types, "Result");
    expect(typ?.generics).toEqual(["T = unknown", "E = Error"]);
  });
});

describe("parseTypeScript — decorators", () => {
  it("extracts a class decorator name", () => {
    const out = parse(`@Component\nclass MyComp {}`);
    const cls = findByName(out.classes, "MyComp");
    expect(cls?.decorators).toEqual(["@Component"]);
  });

  it("extracts a decorator with arguments", () => {
    const out = parse(
      `@Component({ selector: 'x' })\nclass MyComp {}`
    );
    const cls = findByName(out.classes, "MyComp");
    expect(cls?.decorators?.[0]).toContain("@Component");
    expect(cls?.decorators?.[0]).toContain("selector");
  });

  it("extracts multiple decorators on a class", () => {
    const out = parse(
      `@Injectable()\n@Logged\nclass Service {}`
    );
    const cls = findByName(out.classes, "Service");
    expect(cls?.decorators).toHaveLength(2);
  });

  it("extracts method decorators in class children", () => {
    const out = parse(
      `class Api { @Get('/users') listUsers() { return []; } }`
    );
    const cls = findByName(out.classes, "Api");
    const method = cls?.children?.find((c) => c.name === "listUsers");
    expect(method?.decorators?.[0]).toContain("@Get");
  });

  it("extracts parameter decorators", () => {
    const out = parse(
      `class Api { createUser(@Body() body: unknown) { return body; } }`
    );
    const cls = findByName(out.classes, "Api");
    const method = cls?.children?.find((c) => c.name === "createUser");
    expect(method?.parameters?.[0]?.decorators?.[0]).toContain("@Body");
  });
});

describe("parseTypeScript — classes", () => {
  it("extracts extends and implements clauses", () => {
    const out = parse(
      `interface Runnable { run(): void }\nabstract class Base {}\nclass Worker extends Base implements Runnable { run() {} }`
    );
    const cls = findByName(out.classes, "Worker");
    expect(cls?.extends).toEqual(["Base"]);
    expect(cls?.implements).toEqual(["Runnable"]);
  });

  it("marks abstract classes", () => {
    const out = parse(`abstract class Shape { abstract area(): number; }`);
    const cls = findByName(out.classes, "Shape");
    expect(cls?.isAbstract).toBe(true);
    expect(cls?.signature).toContain("abstract");
  });

  it("captures visibility modifiers on methods", () => {
    const out = parse(
      `class A { private secret() {} protected helper() {} public api() {} }`
    );
    const cls = findByName(out.classes, "A");
    const secret = cls?.children?.find((c) => c.name === "secret");
    const helper = cls?.children?.find((c) => c.name === "helper");
    const api = cls?.children?.find((c) => c.name === "api");
    expect(secret?.visibility).toBe("private");
    expect(helper?.visibility).toBe("protected");
    expect(api?.visibility).toBe("public");
  });

  it("captures static members", () => {
    const out = parse(`class A { static count = 0; static inc() { A.count++; } }`);
    const cls = findByName(out.classes, "A");
    const count = cls?.children?.find((c) => c.name === "count");
    const inc = cls?.children?.find((c) => c.name === "inc");
    expect(count?.isStatic).toBe(true);
    expect(inc?.isStatic).toBe(true);
  });

  it("captures constructor parameter properties", () => {
    const out = parse(
      `class User { constructor(public readonly name: string, private age: number) {} }`
    );
    const cls = findByName(out.classes, "User");
    const ctor = cls?.children?.find((c) => c.type === "constructor");
    expect(ctor?.parameters?.[0]?.visibility).toBe("public");
    expect(ctor?.parameters?.[0]?.isReadonly).toBe(true);
    expect(ctor?.parameters?.[1]?.visibility).toBe("private");
  });

  it("captures getter and setter accessors", () => {
    const out = parse(
      `class A { private _v = 0; get value() { return this._v; } set value(x: number) { this._v = x; } }`
    );
    const cls = findByName(out.classes, "A");
    const getter = cls?.children?.find(
      (c) => c.type === "getter" && c.name === "value"
    );
    const setter = cls?.children?.find(
      (c) => c.type === "setter" && c.name === "value"
    );
    expect(getter).toBeDefined();
    expect(setter).toBeDefined();
  });
});

describe("parseTypeScript — interfaces", () => {
  it("extracts interface with properties and methods", () => {
    const out = parse(
      `interface User { id: number; name: string; greet(): string; }`
    );
    const iface = findByName(out.interfaces, "User");
    expect(iface?.children?.some((c) => c.name === "id")).toBe(true);
    expect(iface?.children?.some((c) => c.name === "greet")).toBe(true);
  });

  it("extracts interface extending multiple interfaces", () => {
    const out = parse(
      `interface A { a: string } interface B { b: number } interface C extends A, B { c: boolean }`
    );
    const iface = findByName(out.interfaces, "C");
    expect(iface?.extends).toEqual(["A", "B"]);
  });

  it("extracts optional and readonly properties", () => {
    const out = parse(
      `interface Config { readonly id: string; name?: string; }`
    );
    const iface = findByName(out.interfaces, "Config");
    const id = iface?.children?.find((c) => c.name === "id");
    const name = iface?.children?.find((c) => c.name === "name");
    expect(id?.isReadonly).toBe(true);
    expect(name?.signature).toContain("?");
  });
});

describe("parseTypeScript — type aliases", () => {
  it("extracts union types", () => {
    const out = parse(`type Status = "idle" | "loading" | "error";`);
    const typ = findByName(out.types, "Status");
    expect(typ?.typeAnnotation).toContain("|");
  });

  it("extracts intersection types", () => {
    const out = parse(`type Both = { a: number } & { b: string };`);
    const typ = findByName(out.types, "Both");
    expect(typ?.typeAnnotation).toContain("&");
  });

  it("extracts conditional types", () => {
    const out = parse(
      `type NonNull<T> = T extends null | undefined ? never : T;`
    );
    const typ = findByName(out.types, "NonNull");
    expect(typ?.typeAnnotation).toContain("extends");
    expect(typ?.typeAnnotation).toContain("?");
    expect(typ?.generics).toEqual(["T"]);
  });

  it("extracts mapped types", () => {
    const out = parse(
      `type ReadOnly<T> = { readonly [K in keyof T]: T[K] };`
    );
    const typ = findByName(out.types, "ReadOnly");
    expect(typ?.typeAnnotation).toContain("keyof T");
  });
});

describe("parseTypeScript — enums", () => {
  it("extracts numeric enum members", () => {
    const out = parse(`enum Color { Red, Green, Blue }`);
    const e = findByName(out.enums, "Color");
    expect(e?.children).toHaveLength(3);
    expect(e?.children?.[0]?.name).toBe("Red");
  });

  it("extracts string enum with initializers", () => {
    const out = parse(
      `enum Status { Active = "active", Inactive = "inactive" }`
    );
    const e = findByName(out.enums, "Status");
    const active = e?.children?.find((c) => c.name === "Active");
    expect(active?.initializer).toBe(`"active"`);
  });

  it("marks const enums", () => {
    const out = parse(`const enum Flags { A = 1, B = 2 }`);
    const e = findByName(out.enums, "Flags");
    expect(e?.isReadonly).toBe(true);
    expect(e?.signature).toContain("const enum");
  });
});

describe("parseTypeScript — overloaded function signatures", () => {
  it("records multiple overloads as separate function entries", () => {
    const out = parse(
      `function fmt(v: number): string;
       function fmt(v: Date): string;
       function fmt(v: number | Date): string { return String(v); }`
    );
    const fmts = out.functions.filter((f) => f.name === "fmt");
    expect(fmts.length).toBeGreaterThanOrEqual(3);
  });

  it("preserves distinct signatures per overload", () => {
    const out = parse(
      `function toStr(v: number): string;
       function toStr(v: boolean): string;
       function toStr(v: number | boolean): string { return String(v); }`
    );
    const sigs = out.functions
      .filter((f) => f.name === "toStr")
      .map((f) => f.signature);
    expect(sigs.some((s) => s?.includes("number"))).toBe(true);
    expect(sigs.some((s) => s?.includes("boolean"))).toBe(true);
  });
});

describe("parseTypeScript — ambient declarations", () => {
  it("parses declare module without throwing", () => {
    const out = parse(
      `declare module "foo" { export function bar(): void; }`
    );
    expect(out.language).toBe("typescript");
  });

  it("parses declare global augmentation", () => {
    const out = parse(
      `declare global { interface Window { myProp: string; } }`
    );
    const iface = findByName(out.interfaces, "Window");
    expect(iface).toBeDefined();
  });

  it("parses declare const", () => {
    const out = parse(`declare const VERSION: string;`);
    const v = findByName(out.variables, "VERSION");
    expect(v?.typeAnnotation).toBe("string");
  });
});

describe("parseTypeScript — namespaces", () => {
  it("does not throw on namespace declarations", () => {
    const out = parse(
      `namespace Utils { export function log(msg: string) { console.log(msg); } }`
    );
    expect(out.language).toBe("typescript");
  });

  it("visits exported declarations inside namespaces", () => {
    const out = parse(
      `namespace Math2 { export function double(x: number): number { return x * 2; } }`
    );
    const fn = findByName(out.functions, "double");
    expect(fn).toBeDefined();
  });
});

describe("parseTypeScript — satisfies operator", () => {
  it("parses variables using satisfies without error", () => {
    const out = parse(
      `const cfg = { host: "localhost", port: 3000 } satisfies { host: string; port: number };`
    );
    const v = findByName(out.variables, "cfg");
    expect(v).toBeDefined();
  });
});

describe("parseTypeScript — computed property names", () => {
  it("parses objects with computed property names without error", () => {
    const out = parse(
      `const KEY = "x"; const obj = { [KEY]: 1 }; function use() { return obj; }`
    );
    const use = findByName(out.functions, "use");
    expect(use).toBeDefined();
  });

  it("parses interfaces with index signatures", () => {
    const out = parse(`interface Dict { [key: string]: number }`);
    const iface = findByName(out.interfaces, "Dict");
    expect(iface).toBeDefined();
  });
});

describe("parseTypeScript — module-level arrow functions", () => {
  it("extracts arrow function assigned to a const", () => {
    const out = parse(`const add = (a: number, b: number): number => a + b;`);
    const fn = findByName(out.functions, "add");
    expect(fn?.type).toBe("function");
    expect(fn?.returnType).toBe("number");
    expect(fn?.parameters).toHaveLength(2);
  });

  it("extracts async arrow function", () => {
    const out = parse(
      `export const load = async (id: string): Promise<number> => id.length;`
    );
    const fn = findByName(out.functions, "load");
    expect(fn?.isAsync).toBe(true);
    expect(fn?.isExported).toBe(true);
  });

  it("extracts generic arrow function", () => {
    const out = parse(`const wrap = <T>(x: T): T[] => [x];`);
    const fn = findByName(out.functions, "wrap");
    expect(fn?.generics).toEqual(["T"]);
    expect(fn?.signature).toContain("<T>");
  });
});

describe("parseTypeScript — exports", () => {
  it("extracts named re-exports", () => {
    const out = parse(`export { foo, bar } from "./mod";`);
    expect(out.exports.some((e) => e.name === "foo")).toBe(true);
    expect(out.exports.some((e) => e.name === "bar")).toBe(true);
  });

  it("extracts renamed re-exports", () => {
    const out = parse(`export { foo as fooRenamed } from "./mod";`);
    const exp = out.exports.find((e) => e.name === "fooRenamed");
    expect(exp?.signature).toContain("foo as fooRenamed");
  });

  it("extracts export default expression", () => {
    const out = parse(`const x = 1; export default x;`);
    const exp = out.exports.find((e) => e.name === "default");
    expect(exp?.signature).toContain("export default");
  });

  it("extracts export default with object literal", () => {
    const out = parse(`export default { foo: 1, bar: 2 };`);
    const exp = out.exports.find((e) => e.name === "default");
    expect(exp?.signature).toContain("export default");
  });
});

describe("parseTypeScript — imports", () => {
  it("extracts default import", () => {
    const out = parse(`import React from "react";`);
    const imp = findByName(out.imports, "React");
    expect(imp?.signature).toContain(`from "react"`);
  });

  it("extracts named imports", () => {
    const out = parse(`import { useState, useEffect } from "react";`);
    expect(out.imports.some((i) => i.name === "useState")).toBe(true);
    expect(out.imports.some((i) => i.name === "useEffect")).toBe(true);
  });

  it("extracts renamed named import", () => {
    const out = parse(`import { foo as bar } from "./mod";`);
    const imp = findByName(out.imports, "bar");
    expect(imp?.signature).toContain("foo as bar");
  });

  it("extracts namespace import", () => {
    const out = parse(`import * as ts from "typescript";`);
    const imp = findByName(out.imports, "ts");
    expect(imp?.signature).toContain("import * as ts");
  });
});

describe("parseTypeScript — variables", () => {
  it("extracts const variable with type annotation", () => {
    const out = parse(`const MAX: number = 100;`);
    const v = findByName(out.variables, "MAX");
    expect(v?.typeAnnotation).toBe("number");
    expect(v?.isReadonly).toBe(true);
  });

  it("truncates very long initializers", () => {
    const long = "a".repeat(200);
    const out = parse(`const HUGE = "${long}";`);
    const v = findByName(out.variables, "HUGE");
    expect(v?.initializer?.endsWith("...")).toBe(true);
  });

  it("extracts let variable", () => {
    const out = parse(`let counter = 0;`);
    const v = findByName(out.variables, "counter");
    expect(v?.isReadonly).toBeUndefined();
    expect(v?.signature).toContain("let counter");
  });
});

describe("parseTypeScript — FileStructure shape", () => {
  it("returns a language of typescript for isTypeScript=true", () => {
    const out = parse(`const x = 1;`);
    expect(out.language).toBe("typescript");
  });

  it("returns language=javascript when isTypeScript=false", () => {
    const out = parseTypeScript(`const x = 1;`, false);
    expect(out.language).toBe("javascript");
  });

  it("populates totalLines based on input", () => {
    const src = `const a = 1;\nconst b = 2;\nconst c = 3;`;
    const out = parse(src);
    expect(out.totalLines).toBe(3);
  });

  it("returns empty arrays for an empty file", () => {
    const out = parse(``);
    expect(out.functions).toEqual([]);
    expect(out.classes).toEqual([]);
    expect(out.interfaces).toEqual([]);
  });
});
