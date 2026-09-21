import { describe, expect, test } from "vitest";
import { SchemaPack } from "../src/SchemaPack";

describe("correct bahavior with strings", () => {
    test("correctly encodes and decodes", () => {
        const opcode = SchemaPack.register("str");
        const bytes = SchemaPack.encode(opcode, "hello there, welcome back!");
        const string = SchemaPack.decode(bytes);
        expect(string).toBe("hello there, welcome back!");
    });

    test("correctly encodes and decodes while in array structure", () => {
        const opcode = SchemaPack.register(["str", "u8", ["str"]]);
        const bytes = SchemaPack.encode(opcode, ["hellow", 255, ["i am a string!"]]);
        const data = SchemaPack.decode(bytes);

        expect(data[0]).toBe("hellow");
        expect(data[1]).toBe(255);
        expect(data[2][0]).toBe("i am a string!");
    });

    test("correctly encodes and decodes emojis", () => {
        const opcode = SchemaPack.register("str");
        const bytes = SchemaPack.encode(opcode, "🚀");
        const string = SchemaPack.decode(bytes);
        expect(string).toBe("🚀");
    });

    test("correctly encodes and decodes in mixed structure", () => {
        const opcode = SchemaPack.register(["str", { thingy: "str", a: ["str", "u8", "str"] }]);
        const bytes = SchemaPack.encode(opcode, ["hellow", { thingy: "hello kind sir!", a: ["the next item is a number!", 255, "told you so!"] }]);
        const data = SchemaPack.decode(bytes);

        expect(data[0]).toBe("hellow");
        expect(data[1].thingy).toBe("hello kind sir!");
        expect(data[1].a[0]).toBe("the next item is a number!");
        expect(data[1].a[1]).toBe(255);
        expect(data[1].a[2]).toBe("told you so!");
    });
});

describe("correct error behavior", () => {
    test("schemas with strings are not static", () => {
        expect(() => SchemaPack.register(["str"], { pool: 100 })).toThrow();
    });
});