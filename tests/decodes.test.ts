import { describe, expect, test } from "vitest";
import { SchemaPack } from "../src/SchemaPack";

describe("decodes raw primitives correctly", () => {
    test("decodes bool", () => {
        const opcode = SchemaPack.register("bool");
        const data = new Uint8Array([opcode, 1]);
        expect(SchemaPack.decode(data)).toBe(true);
    });

    test("decodes u8 / byte", () => {
        const opcode = SchemaPack.register("u8");

        const data = new Uint8Array(2);
        data[0] = opcode;
        data[1] = 18;

        expect(SchemaPack.decode(data)).toBe(18);
    });

    test("decodes int32", () => {
        const opcode = SchemaPack.register("i32");
        const data = new Uint8Array(5);
        const view = new DataView(data.buffer);
        data[0] = opcode;

        view.setInt32(1, 9000, true);
        expect(SchemaPack.decode(data)).toBe(9000);

        view.setInt32(1, -9000, true);
        expect(SchemaPack.decode(data)).toBe(-9000);
    });

    test("decodes float64", () => {
        const opcode = SchemaPack.register("f64");

        const data = new Uint8Array(9);
        const view = new DataView(data.buffer);
        data[0] = opcode;
        view.setFloat64(1, 55.4, true);

        expect(SchemaPack.decode(data)).toBe(55.4);
    });
});

describe("decodes primitive arrays correctly", () => {
    test("decodes u8 / byte arrays", () => {
        const opcode = SchemaPack.register(["u8", "u8", ["u8", "u8"], ["u8", ["u8", "u8"], ["u8"]], "u8", "u8", "u8"]);
        const data = new Uint8Array(12);
        data[0] = opcode;
        data[1] = 18;
        data[2] = 24;
        data[3] = 55;
        data[4] = 44;
        data[5] = 23;
        data[6] = 11;
        data[7] = 55;
        data[8] = 32;
        data[9] = 12;
        data[10] = 255;
        data[11] = 200;

        expect(SchemaPack.decode(data)).toStrictEqual([
            18,
            24,
            [55, 44],
            [23, [11, 55], [32]],
            12,
            255,
            200
        ]);
    });

    test("decodes int32 arrays", () => {
        const opcode = SchemaPack.register(["i32", "i32", ["i32", "i32"], ["i32", ["i32"]]]);
        const data = new Uint8Array(25);
        const view = new DataView(data.buffer);

        data[0] = opcode;
        view.setInt32(1, 1000, true);
        view.setInt32(5, -5000, true);
        view.setInt32(9, 2147483647, true);
        view.setInt32(13, -2147483648, true);
        view.setInt32(17, 42, true);
        view.setInt32(21, -999, true);

        expect(SchemaPack.decode(data)).toStrictEqual([
            1000,
            -5000,
            [2147483647, -2147483648],
            [42, [-999]]
        ]);
    });

    test("decodes float64 arrays", () => {
        const opcode = SchemaPack.register(["f64", ["f64", "f64"], ["f64"]]);
        const data = new Uint8Array(33);
        const view = new DataView(data.buffer);

        data[0] = opcode;
        view.setFloat64(1, 3.1415926535, true);
        view.setFloat64(9, -273.15, true);
        view.setFloat64(17, 123456.789, true);
        view.setFloat64(25, -0.00001, true);

        expect(SchemaPack.decode(data)).toStrictEqual([
            3.1415926535,
            [-273.15, 123456.789],
            [-0.00001]
        ]);
    });

    test("decodes mixed primitive arrays", () => {
        const opcode = SchemaPack.register(["f64", ["u8", "f64"], ["f64"], ["bool", "u32", [["bool", "bool"]]]]);
        const data = [6.28, [255, 3.14], [1.6], [false, 200000, [[false, true]]]];
        const bytes = SchemaPack.encode(opcode, data);
        const parsed = SchemaPack.decode(bytes);

        expect(parsed[0]).toBeCloseTo(6.28);
        expect(parsed[1][0]).toBe(255);
        expect(parsed[1][1]).toBeCloseTo(3.14);
        expect(parsed[2][0]).toBeCloseTo(1.6);
        expect(parsed[3][0]).toBe(false);
        expect(parsed[3][1]).toBe(200000);
        expect(parsed[3][2]).toStrictEqual([[false, true]]);
    });
});

describe("complex decode tests", () => {
    test("decodes deeply nested object", () => {
        const opcode = SchemaPack.register({
            networkId: "u32",
            player: {
                identity: { nameId: "u16", team: "u8" },
                attributes: { hp: "f32", mp: "f32", stamina: "f64" }
            }
        });

        const input = {
            networkId: 88888,
            player: {
                identity: { nameId: 512, team: 2 },
                attributes: { hp: 75.5, mp: 120.25, stamina: 999.999 }
            }
        };

        const bytes = SchemaPack.encode(opcode, input);
        const decoded = SchemaPack.decode(bytes);
        expect(decoded).toStrictEqual(input);
    });

    test("decodes multi-level nested object/array", () => {
        const opcode = SchemaPack.register({
            version: "u8",
            dataMatrix: [{
                rowId: "i16",
                values: ["f32", "f32"],
                metadata: { active: "u8", tags: ["u8"] }
            }]
        });

        const input = {
            version: 1,
            dataMatrix: [{
                rowId: -10,
                values: [1.5, 2.5],
                metadata: { active: 1, tags: [100] }
            }]
        };

        const bytes = SchemaPack.encode(opcode, input);
        const decoded = SchemaPack.decode(bytes);
        expect(decoded).toStrictEqual(input);
    });
});