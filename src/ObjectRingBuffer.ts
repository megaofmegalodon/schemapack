import { SchemaPack } from "./SchemaPack.ts";

export class ObjectRingBuffer {
    private buffer: any[] = [];
    private head = 0;

    constructor(opcode: number, pool: number) {
        if (pool <= 0)
            throw new Error(`SchemaPack: Cannot create pool with non-positive integer.`);

        const firstObj = SchemaPack.instantiate(opcode);
        if (!firstObj || typeof firstObj !== "object")
            throw new Error(`SchemaPack: Cannot create pool because opcode '${opcode}' did not return a valid object.`);

        this.buffer.push(firstObj);
        for (let i = 0; i < pool - 1; i++)
            this.buffer.push(structuredClone(firstObj));
    }

    get() {
        const obj = this.buffer[this.head];
        this.head = (this.head + 1) % this.buffer.length;
        return obj;
    }
}