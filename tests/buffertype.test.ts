import { describe, expect, test } from "vitest";
import { SchemaPack } from "../src/SchemaPack";

describe("encodes/decodes BufferType correctly", () => {
    test("dynamic buffer with normal array", () => {
        const opcode = SchemaPack.register({
            id: "u16",
            values: { buffer: "f32" as const }
        });

        const payload = {
            id: 42,
            values: [1.5, 2.5, 3.5, 4.5]
        };

        const encoded = SchemaPack.encode(opcode, payload);
        const decoded = SchemaPack.decode(encoded);

        expect(decoded.id).toBe(42);
        expect(decoded.values).toEqual([1.5, 2.5, 3.5, 4.5]);
    });

    test("dynamic buffer with TypedArray output", () => {
        const opcode = SchemaPack.register({
            scores: { buffer: "i32" as const, useTyped: true }
        });

        const payload = {
            scores: new Int32Array([100, -200, 300, -400])
        };

        const encoded = SchemaPack.encode(opcode, payload);
        const decoded = SchemaPack.decode(encoded);

        expect(decoded.scores).toBeInstanceOf(Int32Array);
        expect(Array.from(decoded.scores)).toEqual([100, -200, 300, -400]);
    });

    test("fixed-length buffer", () => {
        const opcode = SchemaPack.register({
            position: { buffer: "f32" as const, length: 3, useTyped: true }
        });

        const payload = {
            position: new Float32Array([10.5, 20.5, 30.5])
        };

        const encoded = SchemaPack.encode(opcode, payload);
        expect(encoded.length).toBe(13);

        const decoded = SchemaPack.decode(encoded);
        expect(decoded.position).toBeInstanceOf(Float32Array);
        expect(Array.from(decoded.position)).toEqual([10.5, 20.5, 30.5]);
    });

    test("multiple buffers with trailing primitives", () => {
        const opcode = SchemaPack.register({
            header: "u8" as const,
            data1: { buffer: "u16" as const },
            data2: { buffer: "f64" as const, useTyped: true },
            footer: "u32" as const
        });

        const payload = {
            header: 255,
            data1: [10, 20, 30],
            data2: new Float64Array([1.4, 2.22]),
            footer: 12345678
        };

        const encoded = SchemaPack.encode(opcode, payload);
        const decoded = SchemaPack.decode(encoded);

        expect(decoded.header).toBe(255);
        expect(decoded.data1).toEqual([10, 20, 30]);
        expect(decoded.data2).toBeInstanceOf(Float64Array);
        expect(decoded.data2[0]).toBeCloseTo(1.4);
        expect(decoded.data2[1]).toBeCloseTo(2.22);
        expect(decoded.footer).toBe(12345678);
    });

    test("empty buffer payload", () => {
        const opcode = SchemaPack.register({
            tags: { buffer: "u8" as const }
        });

        const payload = { tags: [] };
        const encoded = SchemaPack.encode(opcode, payload);
        const decoded = SchemaPack.decode(encoded);

        expect(decoded.tags).toEqual([]);
    });

    test("rejects bad buffer lengths", () => {
        const opcode = SchemaPack.register({
            items: { buffer: "u32" as const }
        });

        const payload = { items: [1, 2, 3] };
        const encoded = SchemaPack.encode(opcode, payload);

        const tampered = new Uint8Array(encoded);
        const view = new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength);
        view.setInt32(1, 1000000, true);

        expect(() => {
            SchemaPack.decode(tampered);
        }).toThrow("SchemaPack: Malformed buffer length 1000000 exceeds incoming packet payload (17 bytes).");
    });

    test("rejects truncated data packet", () => {
        const opcode = SchemaPack.register({
            matrix: { buffer: "f32" as const, length: 16 }
        });

        const payload = { matrix: new Float32Array(16) };
        const encoded = SchemaPack.encode(opcode, payload);
        const truncated = encoded.subarray(0, 10);

        expect(() => {
            SchemaPack.decode(truncated);
        }).toThrow("SchemaPack: Malformed buffer length 16 exceeds incoming packet payload (10 bytes).");
    });
});