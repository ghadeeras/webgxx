import type { GLDevice } from "./device.js";
import { alignTo, expect, GL, type DeepRequired } from "./utils.js";

export class GLBuffer implements GPUBuffer {

    private _mapState: GPUBufferMapState = this.descriptor.mappedAtCreation ? "mapped" : "unmapped"
    private _accessMode: "read" | "write" | "none" = this.descriptor.mappedAtCreation ? "write" : "none"
    private _views: [ArrayBuffer, number][] = []

    readonly wrapped: WebGLBuffer = this.device.context.createBuffer()
    readonly target: GLenum = bufferTarget(this.descriptor.usage)

    private constructor(readonly device: GLDevice, readonly descriptor: DeepRequired<GPUBufferDescriptor>) {
        this.whileBound(() => this.device.context.bufferData(this.target, alignTo(16, descriptor.size), usage(this.usage)))
    }

    static create(device: GLDevice, descriptor: GPUBufferDescriptor) {
        return new GLBuffer(device, {
            ...descriptor,
            label: descriptor.label ?? "[Unlabeled Buffer]",
            mappedAtCreation: descriptor.mappedAtCreation ?? false,
        })
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUBuffer";

    readonly label: string = this.descriptor.label

    readonly size: number = this.descriptor.size

    readonly usage: number = this.descriptor.usage

    get mapState() {
        return this._mapState
    }

    async mapAsync(mode: GPUMapModeFlags, offset: number = 0, size: number = this.size - offset): Promise<undefined> {
        switch (mode) {
            case GPUMapMode.READ: {
                this._mapState = (this.usage & GPUBufferUsage.MAP_READ) !== 0 ? "pending" : expect("Map-read buffer")
                await this.device.queue.onSubmittedWorkDone()
                this.accessMode = "read"
                return
            }
            case GPUMapMode.WRITE:  {
                this.accessMode = (this.usage & GPUBufferUsage.MAP_WRITE) !== 0 ? "write" : expect("Map-write buffer")
                return
            }
            default: return expect("Either read or write mapping request")
        }
    }

    getMappedRange(offset: number = 0, size: number = this.size - offset): ArrayBuffer {
        switch (this.accessMode) {
            case "read": return this.whileBound(() => {
                const buffer = new ArrayBuffer(size)
                const array = new Uint8Array(buffer)
                this.device.context.getBufferSubData(this.target, offset, array, 0, buffer.byteLength)
                return buffer
            });
            case "write": {
                const buffer = new ArrayBuffer(size)
                this._views.push([buffer, offset]); 
                return buffer
            }
            case "none": return expect("Accessible buffer")
        }
    }

    unmap(): undefined {
        if (this.accessMode === "write") {
            this.whileBound(() => {
                const views = this._views
                this._views = []
                for (const [buffer, offset] of views) {
                    this.device.context.bufferSubData(this.target, offset, buffer)
                }
            })
        }
        this.accessMode = "none"
    }

    destroy(): undefined {
        this.device.context.deleteBuffer(this.wrapped)
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
    private get accessMode() {
        return this._accessMode
    }
    private set accessMode(mode: typeof this._accessMode) {
        this._accessMode = mode
        this._mapState = mode === "none" ? "unmapped" : "mapped"
    }

    asSource<T>(logic: () => T): T {
        return this.whileBoundTo(GL.COPY_READ_BUFFER, logic)
    }

    asDestination<T>(logic: () => T): T {
        return this.whileBoundTo(GL.COPY_WRITE_BUFFER, logic)
    }

    asPixelSource<T>(logic: () => T): T {
        return this.whileBoundTo(GL.PIXEL_UNPACK_BUFFER, logic)
    }

    asPixelDestination<T>(logic: () => T): T {
        return this.whileBoundTo(GL.PIXEL_PACK_BUFFER, logic)
    }

    whileBound<T>(logic: () => T): T {
        return this.whileBoundTo(this.target, logic)
    }

    whileBoundTo<T>(target: GLenum, logic: () => T): T {
        const gl = this.device.context
        gl.bindBuffer(target, this.wrapped)
        try {
            return logic()
        } finally {
            gl.bindBuffer(target, null)
        }
    }

    writeBuffer(bufferOffset: GPUSize64, data: GPUAllowSharedBufferSource, dataOffset: GPUSize64 = 0, size: GPUSize64 = data.byteLength - dataOffset): undefined {
        this.whileBound(() => {
            this.device.context.bufferSubData(this.target, bufferOffset, "slice" in data ? new Uint8Array(data) : data, dataOffset, size)
        })
    }

    clearBuffer(offset: GPUSize64 = 0, size: GPUSize64 = this.size - offset): undefined {
        this.writeBuffer(offset, new Uint8Array(size))
    }

}

function usage(usage: GPUBufferUsageFlags): number {
    const result = 
          (usage & GPUBufferUsage.MAP_WRITE) !== 0 ? GL.STREAM_DRAW 
        : (usage & GPUBufferUsage.MAP_READ ) !== 0 ? GL.STREAM_READ 
        : GL.STATIC_DRAW;
    return result
}

function bufferTarget(usage: GPUBufferUsageFlags): number {
    return false ? 0
        : (usage & GPUBufferUsage.VERTEX   ) !== 0 ? GL.ARRAY_BUFFER
        : (usage & GPUBufferUsage.INDEX    ) !== 0 ? GL.ELEMENT_ARRAY_BUFFER
        : (usage & GPUBufferUsage.UNIFORM  ) !== 0 ? GL.UNIFORM_BUFFER
        : (usage & GPUBufferUsage.MAP_WRITE) !== 0 ? GL.PIXEL_UNPACK_BUFFER 
        : (usage & GPUBufferUsage.MAP_READ ) !== 0 ? GL.PIXEL_PACK_BUFFER 
        : GL.PIXEL_PACK_BUFFER
}
