import { describe, expect, test } from "vitest";
import { SchemaPack } from "../src/SchemaPack";

describe("encodes raw primitives correctly", () => {
    test("encodes u8 / byte", () => {
        const opcode = SchemaPack.register("u8");
        const data = SchemaPack.encode(opcode, 25);
        expect(data).toStrictEqual(new Uint8Array([opcode, 25]));
    });

    test("encodes i32", () => {
        const opcode = SchemaPack.register("i32");
        const data = SchemaPack.encode(opcode, 3);

        const testArr = new Uint8Array(5);
        testArr[0] = opcode;
        new DataView(testArr.buffer).setInt32(1, 3, true);

        expect(data).toStrictEqual(testArr);
    });

    test("encodes f32", () => {
        const opcode = SchemaPack.register("f32");
        const data = SchemaPack.encode(opcode, 3.14);

        const testArr = new Uint8Array(5);
        testArr[0] = opcode;
        new DataView(testArr.buffer).setFloat32(1, 3.14, true);

        expect(data).toStrictEqual(testArr);
    });
});

describe("encodes primitive arrays", () => {
    test("encodes mixed primitives array", () => {
        const opcode = SchemaPack.register(["i32", "f64", ["i32", "f64"], "u16"]);
        const bytes = SchemaPack.encode(opcode, [23, 3.14, [55, 6.28], 99]);
        const data = SchemaPack.decode(bytes);

        expect(data).toStrictEqual([23, 3.14, [55, 6.28], 99]);
    });

    test("encodes heavily nested primitives array", () => {
        const opcode = SchemaPack.register(["i32", ["f64"], ["i32", "f64"], "u16", [[["f32"]]], "i16"]);
        const bytes = SchemaPack.encode(opcode, [23, [3.14], [55, 6.28], 99, [[[3.5]]], 33]);
        const data = SchemaPack.decode(bytes);

        expect(data).toStrictEqual([23, [3.14], [55, 6.28], 99, [[[3.5]]], 33]);
    });
});