import { describe, expect, test } from "vitest";
import { SchemaPack } from "../src/SchemaPack";

describe("decodePooled raw primitives rejection", () => {
    test("throws error when trying to register pooled raw primitives schemas", () => {
        expect(() => SchemaPack.register("bool", { pool: 100 })).toThrow();
        expect(() => SchemaPack.register("f32", { pool: 100 })).toThrow();
    });
});

describe("decodePooled primitive arrays", () => {
    test("decodes u8 / byte arrays", () => {
        const opcode = SchemaPack.register(["u8", "u8", ["u8", "u8"], ["u8", ["u8", "u8"], ["u8"]], "u8", "u8", "u8"], { pool: 100 });
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

        expect(SchemaPack.decodePooled(data)).toStrictEqual([
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
        const opcode = SchemaPack.register(["i32", "i32", ["i32", "i32"], ["i32", ["i32"]]], { pool: 100 });
        const data = new Uint8Array(25);
        const view = new DataView(data.buffer);

        data[0] = opcode;
        view.setInt32(1, 1000, true);
        view.setInt32(5, -5000, true);
        view.setInt32(9, 2147483647, true);
        view.setInt32(13, -2147483648, true);
        view.setInt32(17, 42, true);
        view.setInt32(21, -999, true);

        expect(SchemaPack.decodePooled(data)).toStrictEqual([
            1000,
            -5000,
            [2147483647, -2147483648],
            [42, [-999]]
        ]);
    });

    test("decodes float64 arrays", () => {
        const opcode = SchemaPack.register(["f64", ["f64", "f64"], ["f64"]], { pool: 100 });
        const data = new Uint8Array(33);
        const view = new DataView(data.buffer);

        data[0] = opcode;
        view.setFloat64(1, 3.1415926535, true);
        view.setFloat64(9, -273.15, true);
        view.setFloat64(17, 123456.789, true);
        view.setFloat64(25, -0.00001, true);

        expect(SchemaPack.decodePooled(data)).toStrictEqual([
            3.1415926535,
            [-273.15, 123456.789],
            [-0.00001]
        ]);
    });

    test("decodes mixed primitive arrays", () => {
        const opcode = SchemaPack.register(["f64", ["u8", "f64"], ["f64"], ["bool", "u32", [["bool", "bool"]]]], { pool: 100 });
        const data = [6.28, [255, 3.14], [1.6], [false, 200000, [[false, true]]]];
        const bytes = SchemaPack.encode(opcode, data);
        const parsed = SchemaPack.decodePooled(bytes);

        expect(parsed[0]).toBeCloseTo(6.28);
        expect(parsed[1][0]).toBe(255);
        expect(parsed[1][1]).toBeCloseTo(3.14);
        expect(parsed[2][0]).toBeCloseTo(1.6);
        expect(parsed[3][0]).toBe(false);
        expect(parsed[3][1]).toBe(200000);
        expect(parsed[3][2]).toStrictEqual([[false, true]]);
    });
});

describe("complex decodePooled tests", () => {
    test("decodes deeply nested object", () => {
        const opcode = SchemaPack.register({
            networkId: "u32",
            player: {
                identity: { nameId: "u16", team: "u8" },
                attributes: { hp: "f32", mp: "f32", stamina: "f64" }
            }
        }, { pool: 100 });

        const input = {
            networkId: 88888,
            player: {
                identity: { nameId: 512, team: 2 },
                attributes: { hp: 75.5, mp: 120.25, stamina: 999.999 }
            }
        };

        const bytes = SchemaPack.encode(opcode, input);
        const decoded = SchemaPack.decodePooled(bytes);

        expect(decoded.networkId).toBe(input.networkId);
        expect(decoded.player.identity).toStrictEqual(input.player.identity);
        expect(decoded.player.attributes.hp).toBeCloseTo(input.player.attributes.hp);
        expect(decoded.player.attributes.mp).toBeCloseTo(input.player.attributes.mp);
        expect(decoded.player.attributes.stamina).toBeCloseTo(input.player.attributes.stamina);
    });

    test("decodes multi-level nested object/array", () => {
        const opcode = SchemaPack.register({
            version: "u8",
            dataMatrix: [{
                rowId: "i16",
                values: ["f32", "f32"],
                metadata: { active: "u8", tags: ["u8"] }
            }]
        }, { pool: 100 });

        const input = {
            version: 1,
            dataMatrix: [{
                rowId: -10,
                values: [1.5, 2.5],
                metadata: { active: 1, tags: [100] }
            }]
        };

        const bytes = SchemaPack.encode(opcode, input);
        const decoded = SchemaPack.decodePooled(bytes);

        expect(decoded.version).toBe(input.version);
        expect(decoded.dataMatrix[0].rowId).toBe(input.dataMatrix[0].rowId);
        expect(decoded.dataMatrix[0].values[0]).toBeCloseTo(1.5);
        expect(decoded.dataMatrix[0].values[1]).toBeCloseTo(2.5);
        expect(decoded.dataMatrix[0].metadata).toStrictEqual(input.dataMatrix[0].metadata);
    });

    test("verifies object reference reuse across pooled decodes", () => {
        const opcode = SchemaPack.register({
            id: "u32",
            pos: { x: "f32", y: "f32" }
        }, { pool: 1 });

        const packet1 = SchemaPack.encode(opcode, { id: 1, pos: { x: 10.0, y: 20.0 } }, true);
        const packet2 = SchemaPack.encode(opcode, { id: 2, pos: { x: 30.0, y: 40.0 } }, true);

        const decoded1 = SchemaPack.decodePooled(packet1);
        expect(decoded1.id).toBe(1);
        expect(decoded1.pos.x).toBeCloseTo(10.0);

        const refBefore = decoded1;
        const decoded2 = SchemaPack.decodePooled(packet2);

        expect(decoded2).toBe(refBefore);
        expect(decoded2.id).toBe(2);
        expect(decoded2.pos.x).toBeCloseTo(30.0);
    });
});