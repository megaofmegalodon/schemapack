import { describe, expect, test } from "vitest";
import { SchemaPack } from "../src/SchemaPack";

describe("instantiate method functions correctly", () => {
    describe("primitive arrays", () => {
        test("instantiates flat primitive arrays", () => {
            const opcode = SchemaPack.register(["u8", "u16", "f32", "bool"]);
            const result = SchemaPack.instantiate(opcode);
            expect(result).toStrictEqual([0, 0, 0, false]);
        });

        test("instantiates deeply nested primitive arrays", () => {
            const opcode = SchemaPack.register(["i32", ["f64"], ["i32", "f64"], "u16", ["f32", ["f32", ["f32", "f32", "f32"]]], "i16",]);
            const result = SchemaPack.instantiate(opcode);
            expect(result).toStrictEqual([0, [0], [0, 0], 0, [0, [0, [0, 0, 0]]], 0,]);
        });
    });

    describe("correctly instantiates objects", () => {
        test("instantiates flat objects with correct default types", () => {
            const opcode = SchemaPack.register({
                id: "u32",
                score: "f32",
                isOnline: "bool",
            });

            const result = SchemaPack.instantiate(opcode);
            expect(result).toStrictEqual({
                id: 0,
                score: 0,
                isOnline: false,
            });
        });

        test("instantiates deeply nested objects", () => {
            const opcode = SchemaPack.register({
                header: "u8",
                player: {
                    stats: { hp: "u16", mp: "u16", },
                    isBuffed: "bool"
                }
            });

            const result = SchemaPack.instantiate(opcode);
            expect(result).toStrictEqual({
                header: 0,
                player: {
                    stats: { hp: 0, mp: 0, },
                    isBuffed: false
                }
            });
        });
    });

    describe("instantiates buffers", () => {
        test("instantiates fixed-length primitive buffers", () => {
            const opcode = SchemaPack.register({ coords: { buffer: "u8" as const, length: 3 } });
            const result = SchemaPack.instantiate(opcode);
            expect(result).toStrictEqual({ coords: [0, 0, 0], });
        });

        test("instantiates TypedArrays when specified in schema", () => {
            const opcode = SchemaPack.register({
                data: { buffer: "u8" as const, length: 4, useTyped: true },
            });

            const result = SchemaPack.instantiate(opcode);
            expect(result.data).toBeInstanceOf(Uint8Array);
            expect(result.data).toHaveLength(4);
            expect(Array.from(result.data)).toEqual([0, 0, 0, 0]);
        });

        test("instantiates dynamic buffers with length 0", () => {
            const opcode = SchemaPack.register({ dynamicList: { buffer: "u8" }, });
            const result = SchemaPack.instantiate(opcode);
            expect(result).toStrictEqual({ dynamicList: [] });
        });
    });

    describe("handles errors correctly", () => {
        test("throws error for unregistered opcodes", () => {
            expect(() => SchemaPack.instantiate(999)).toThrow("SchemaPack: Invalid opcode, cannot instantiate unknown opcode of '$999'.");
        });
    });
});