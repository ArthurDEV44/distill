/**
 * Swift Tree-sitter Parser Tests
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  swiftTreeSitterParser,
  parseSwiftAsync,
  initSwiftParser,
} from "./parser.js";

// Sample Swift code for testing
const SAMPLE_SWIFT = `
import Foundation
import UIKit

/// Maximum number of users allowed
let MAX_USERS = 100

/// Default timeout in seconds
var defaultTimeout: TimeInterval = 30.0

/// Represents a user in the system
protocol UserProtocol {
    var name: String { get }
    var email: String { get }
    func greet() -> String
}

/// A type alias for user identifiers
typealias UserID = String

/// Represents a basic user
class User: UserProtocol {
    /// The user's name
    public var name: String

    /// The user's email
    private var email: String

    /// The user's unique identifier
    let id: UserID

    /// Create a new user instance
    public init(name: String, email: String) {
        self.name = name
        self.email = email
        self.id = UUID().uuidString
    }

    deinit {
        print("User \\(name) is being deallocated")
    }

    /// Get the user's greeting
    public func greet() -> String {
        return "Hello, \\(name)"
    }

    /// Check if user is valid
    private func isValid() -> Bool {
        return !email.isEmpty && !name.isEmpty
    }

    /// Async method to fetch user data
    public func fetchData() async throws -> Data {
        return Data()
    }
}

/// Admin user with extra permissions
final class AdminUser: User {
    /// The admin's permissions
    var permissions: [String] = []

    /// Check if admin has a permission
    public func hasPermission(_ perm: String) -> Bool {
        return permissions.contains(perm)
    }
}

/// User status enum
enum UserStatus: String {
    case active
    case inactive
    case suspended

    /// Get status description
    func description() -> String {
        switch self {
        case .active: return "Active"
        case .inactive: return "Inactive"
        case .suspended: return "Suspended"
        }
    }
}

/// Result type for network operations
enum NetworkResult<T> {
    case success(T)
    case failure(Error)
}

/// Extension adding utility methods to User
extension User {
    /// Get a formatted display name
    func displayName() -> String {
        return name.capitalized
    }

    /// Static factory method
    static func guest() -> User {
        return User(name: "Guest", email: "guest@example.com")
    }
}

/// A simple struct for coordinates
struct Point {
    var x: Double
    var y: Double

    /// Calculate distance from origin
    func distanceFromOrigin() -> Double {
        return (x * x + y * y).squareRoot()
    }
}

/// Top-level function to process users
func processUser(_ user: User) -> Bool {
    return !user.name.isEmpty
}

/// Async function to fetch all users
func fetchAllUsers() async throws -> [User] {
    return []
}
`;

describe("Swift Tree-sitter Parser", () => {
  beforeAll(async () => {
    await initSwiftParser();
  });

  describe("parseSwiftAsync", () => {
    it("should parse imports correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      expect(result.language).toBe("swift");
      expect(result.imports.length).toBeGreaterThanOrEqual(2);

      const foundationImport = result.imports.find((i) => i.name === "Foundation");
      expect(foundationImport).toBeDefined();
      expect(foundationImport?.signature).toBe("import Foundation");

      const uiKitImport = result.imports.find((i) => i.name === "UIKit");
      expect(uiKitImport).toBeDefined();
    });

    it("should parse top-level variables correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const maxUsers = result.variables.find((v) => v.name === "MAX_USERS");
      expect(maxUsers).toBeDefined();

      const defaultTimeout = result.variables.find((v) => v.name === "defaultTimeout");
      expect(defaultTimeout).toBeDefined();
    });

    it("should parse protocols correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const userProtocol = result.interfaces.find((i) => i.name === "UserProtocol");
      expect(userProtocol).toBeDefined();
      expect(userProtocol?.signature).toContain("protocol UserProtocol");
      expect(userProtocol?.documentation).toContain("Represents a user");
    });

    it("should parse classes correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const userClass = result.classes.find((c) => c.name === "User");
      expect(userClass).toBeDefined();
      expect(userClass?.signature).toContain("class User");
      expect(userClass?.documentation).toContain("Represents a basic user");

      const adminClass = result.classes.find((c) => c.name === "AdminUser");
      expect(adminClass).toBeDefined();
      expect(adminClass?.signature).toContain("final");
      expect(adminClass?.signature).toContain("AdminUser");
    });

    it("should parse structs correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const pointStruct = result.classes.find((c) => c.name === "Point");
      expect(pointStruct).toBeDefined();
      expect(pointStruct?.signature).toContain("struct Point");
    });

    it("should parse enums correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const statusEnum = result.types.find((t) => t.name === "UserStatus");
      expect(statusEnum).toBeDefined();
      expect(statusEnum?.signature).toContain("enum UserStatus");

      const resultEnum = result.types.find((t) => t.name === "NetworkResult");
      expect(resultEnum).toBeDefined();
    });

    it("should parse extensions correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const userExtension = result.types.find((t) => t.name === "extension User");
      expect(userExtension).toBeDefined();
      expect(userExtension?.signature).toContain("extension User");
    });

    it("should parse typealias correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const userIdType = result.types.find((t) => t.name === "UserID");
      expect(userIdType).toBeDefined();
      expect(userIdType?.signature).toContain("typealias UserID");
    });

    it("should parse functions correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const processUser = result.functions.find((f) => f.name === "processUser");
      expect(processUser).toBeDefined();
      expect(processUser?.type).toBe("function");
      expect(processUser?.signature).toContain("func processUser");

      const fetchAllUsers = result.functions.find((f) => f.name === "fetchAllUsers");
      expect(fetchAllUsers).toBeDefined();
      expect(fetchAllUsers?.isAsync).toBe(true);
    });

    it("should parse methods correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const greetMethod = result.functions.find((f) => f.name === "greet" && f.parent === "User");
      expect(greetMethod).toBeDefined();
      expect(greetMethod?.type).toBe("method");
      expect(greetMethod?.signature).toContain("func greet");

      const fetchDataMethod = result.functions.find((f) => f.name === "fetchData");
      expect(fetchDataMethod).toBeDefined();
      expect(fetchDataMethod?.isAsync).toBe(true);
    });

    it("should parse init and deinit correctly", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const initMethod = result.functions.find((f) => f.name === "init" && f.parent === "User");
      expect(initMethod).toBeDefined();
      expect(initMethod?.type).toBe("method");

      const deinitMethod = result.functions.find((f) => f.name === "deinit");
      expect(deinitMethod).toBeDefined();
    });

    it("should extract documentation comments", async () => {
      const result = await parseSwiftAsync(SAMPLE_SWIFT);

      const userClass = result.classes.find((c) => c.name === "User");
      expect(userClass?.documentation).toBeDefined();
      expect(userClass?.documentation).toContain("Represents a basic user");

      const greetMethod = result.functions.find((f) => f.name === "greet" && f.parent === "User");
      expect(greetMethod?.documentation).toContain("Get the user's greeting");
    });
  });

  describe("extractSwiftElement", () => {
    it("should extract a specific class", async () => {
      const result = await swiftTreeSitterParser.extractElement(
        SAMPLE_SWIFT,
        { type: "class", name: "User" },
        { includeImports: true, includeComments: true }
      );

      expect(result).not.toBeNull();
      expect(result?.elements[0]?.name).toBe("User");
      expect(result?.content).toContain("class User");
    });

    it("should extract a specific function", async () => {
      const result = await swiftTreeSitterParser.extractElement(
        SAMPLE_SWIFT,
        { type: "function", name: "processUser" },
        { includeImports: false, includeComments: true }
      );

      expect(result).not.toBeNull();
      expect(result?.elements[0]?.name).toBe("processUser");
      expect(result?.content).toContain("func processUser");
    });

    it("should extract a specific protocol", async () => {
      const result = await swiftTreeSitterParser.extractElement(
        SAMPLE_SWIFT,
        { type: "interface", name: "UserProtocol" },
        { includeImports: false, includeComments: true }
      );

      expect(result).not.toBeNull();
      expect(result?.elements[0]?.name).toBe("UserProtocol");
      expect(result?.content).toContain("protocol UserProtocol");
    });

    it("should return null for non-existent element", async () => {
      const result = await swiftTreeSitterParser.extractElement(
        SAMPLE_SWIFT,
        { type: "class", name: "NonExistent" },
        { includeImports: false, includeComments: false }
      );

      expect(result).toBeNull();
    });
  });

  describe("searchSwiftElements", () => {
    it("should find elements by name", async () => {
      const results = swiftTreeSitterParser.searchElements(SAMPLE_SWIFT, "user");

      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.name.toLowerCase());
      expect(names.some((n) => n.includes("user"))).toBe(true);
    });

    it("should find elements by signature", async () => {
      const results = swiftTreeSitterParser.searchElements(SAMPLE_SWIFT, "async");

      expect(results.length).toBeGreaterThan(0);
      const hasAsync = results.some((r) => r.signature?.includes("async"));
      expect(hasAsync).toBe(true);
    });

    it("should find elements by documentation", async () => {
      const results = swiftTreeSitterParser.searchElements(SAMPLE_SWIFT, "greeting");

      expect(results.length).toBeGreaterThan(0);
    });

    it("should return empty array for no matches", async () => {
      const results = swiftTreeSitterParser.searchElements(SAMPLE_SWIFT, "xyznonexistent");

      expect(results).toEqual([]);
    });
  });

  describe("swiftTreeSitterParser interface", () => {
    it("should have correct languages", () => {
      expect(swiftTreeSitterParser.languages).toContain("swift");
    });

    it("should implement parse method", () => {
      const result = swiftTreeSitterParser.parse(SAMPLE_SWIFT);
      expect(result.language).toBe("swift");
      expect(result.totalLines).toBeGreaterThan(0);
    });
  });
});

describe("Swift specific features", () => {
  beforeAll(async () => {
    await initSwiftParser();
  });

  it("should handle generic types", async () => {
    const code = `
enum Result<Success, Failure: Error> {
    case success(Success)
    case failure(Failure)
}

func process<T: Codable>(_ item: T) -> T {
    return item
}
`;
    const result = await parseSwiftAsync(code);

    const resultEnum = result.types.find((t) => t.name === "Result");
    expect(resultEnum).toBeDefined();

    const processFunc = result.functions.find((f) => f.name === "process");
    expect(processFunc).toBeDefined();
  });

  it("should handle property wrappers", async () => {
    const code = `
class ViewModel {
    @Published var name: String = ""
    @State private var count: Int = 0
}
`;
    const result = await parseSwiftAsync(code);

    expect(result.classes.find((c) => c.name === "ViewModel")).toBeDefined();
  });

  it("should handle async/await", async () => {
    const code = `
func fetchData() async throws -> Data {
    return Data()
}

func process() async {
    do {
        let data = try await fetchData()
    } catch {
        print("Error")
    }
}
`;
    const result = await parseSwiftAsync(code);

    const fetchData = result.functions.find((f) => f.name === "fetchData");
    expect(fetchData?.isAsync).toBe(true);

    const process = result.functions.find((f) => f.name === "process");
    expect(process?.isAsync).toBe(true);
  });

  it("should handle access modifiers", async () => {
    const code = `
public class PublicClass {
    public var publicVar: String = ""
    private var privateVar: String = ""
    fileprivate var fileprivateVar: String = ""
    internal var internalVar: String = ""
}

open class OpenClass {}
`;
    const result = await parseSwiftAsync(code);

    const publicClass = result.classes.find((c) => c.name === "PublicClass");
    expect(publicClass).toBeDefined();
    expect(publicClass?.isExported).toBe(true);

    const openClass = result.classes.find((c) => c.name === "OpenClass");
    expect(openClass).toBeDefined();
  });

  it("should handle computed properties", async () => {
    const code = `
struct Rectangle {
    var width: Double
    var height: Double

    var area: Double {
        return width * height
    }

    var perimeter: Double {
        get { return 2 * (width + height) }
    }
}
`;
    const result = await parseSwiftAsync(code);

    const rectangle = result.classes.find((c) => c.name === "Rectangle");
    expect(rectangle).toBeDefined();
  });

  it("should handle protocol extensions", async () => {
    const code = `
protocol Describable {
    var description: String { get }
}

extension Describable {
    func describe() {
        print(description)
    }
}
`;
    const result = await parseSwiftAsync(code);

    const describable = result.interfaces.find((i) => i.name === "Describable");
    expect(describable).toBeDefined();

    const extension = result.types.find((t) => t.name === "extension Describable");
    expect(extension).toBeDefined();
  });
});
