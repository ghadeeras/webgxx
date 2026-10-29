import type { GLBuffer } from "./buffer.js";
import type { GLDevice } from "./device.js";
import { GLRenderPassEncoder } from "./passes.js";
import type { GLTexture } from "./texture.js";
import { expect, extent3D, GL, notImplemented, origin3D, type DeepRequired } from "./utils.js";

export class GLCommandEncoder implements GPUCommandEncoder {

    private commands: (() => void)[] = []

    private constructor(readonly device: GLDevice, readonly descriptor: DeepRequired<GPUCommandEncoderDescriptor>) {}

    static create(device: GLDevice, descriptor: GPUCommandEncoderDescriptor) {
        return new GLCommandEncoder(device, {
            label: descriptor.label ?? "[Unlabeled Command Encoder]"
        })
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUCommandEncoder"

    readonly label: string = this.descriptor.label

    beginComputePass(descriptor: GPUComputePassDescriptor = {}): GPUComputePassEncoder {
        return notImplemented("beginComputePass")
    }

    beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder {
        return GLRenderPassEncoder.create(this.device, descriptor, command => this.commands.push(command))
    }

    clearBuffer(buffer: GPUBuffer, offset?: GPUSize64, size?: GPUSize64): undefined {
        const glBuffer = buffer as GLBuffer
        this.commands.push(() => {
            glBuffer.clearBuffer(offset, size)
        })
    }

    copyBufferToBuffer(
        source: GPUBuffer, 
        sourceOffsetOrDestination: GPUSize64 | GPUBuffer, 
        destinationOrSize?: GPUBuffer | GPUSize64, 
        destinationOffset?: GPUSize64, 
        size?: GPUSize64
    ): undefined {
        if (typeof sourceOffsetOrDestination === "number" && typeof destinationOrSize === "object" && destinationOffset !== undefined) {
            this.doCopyBufferToBuffer(source, sourceOffsetOrDestination, destinationOrSize, destinationOffset, size)
        } else if (typeof sourceOffsetOrDestination !== "number" && typeof destinationOrSize !== "object" ) {
            this.doCopyBufferToBuffer(source, 0, sourceOffsetOrDestination, 0, destinationOrSize)
        } else {
            return expect("Correct parameter types for buffer copy function")
        }
    }

    copyBufferToTexture(source: GPUTexelCopyBufferInfo, destination: GPUTexelCopyTextureInfo, copySize: GPUExtent3DStrict): undefined {
        const [x, y, z] = origin3D(destination.origin ?? [0, 0, 0])
        const [width, height] =  extent3D(copySize)
        const texture = destination.texture as GLTexture
        const buffer = source.buffer as GLBuffer
        this.commands.push(() => {
            // TODO Handle 3D textures
            texture.whileBound(() => {
                buffer.asPixelSource(() => {
                    this.device.context.texSubImage2D(texture.target, destination.mipLevel ?? 0, x, y, width, height, GL.RGBA, GL.UNSIGNED_BYTE, source.offset ?? 0)
                })
            })
        })
    }

    copyTextureToBuffer(source: GPUTexelCopyTextureInfo, destination: GPUTexelCopyBufferInfo, copySize: GPUExtent3DStrict): undefined {
        const [x, y, z] = origin3D(source.origin ?? [0, 0, 0])
        const [width, height] =  extent3D(copySize)
        const texture = source.texture as GLTexture
        const buffer = destination.buffer as GLBuffer
        this.commands.push(() => {
            // TODO Handle 3D textures
            texture.asSource(source.mipLevel ?? 0, z, () => {
                buffer.asPixelDestination(() => {
                    this.device.context.readPixels(x, texture.height - y, width, height, GL.RGBA, GL.UNSIGNED_BYTE, 0)
                })
            })
        })
    }

    copyTextureToTexture(source: GPUTexelCopyTextureInfo, destination: GPUTexelCopyTextureInfo, copySize: GPUExtent3DStrict): undefined {
        const [x1, y1, z1] = origin3D(source.origin ?? [0, 0, 0])
        const [x2, y2, z2] = origin3D(destination.origin ?? [0, 0, 0])
        const [width, height] =  extent3D(copySize)
        const src = source.texture as GLTexture
        const dst = destination.texture as GLTexture
        this.commands.push(() => {
            // TODO Handle 3D textures
            src.asSource(source.mipLevel ?? 0, z1, () => {
                dst.asDestination(destination.mipLevel ?? 0, z2, () => {
                    src.blit([x1, y1], dst, [x2, y2], [width, height])
                })
            })
        })
    }

    resolveQuerySet(querySet: GPUQuerySet, firstQuery: GPUSize32, queryCount: GPUSize32, destination: GPUBuffer, destinationOffset: GPUSize64): undefined {
        return notImplemented("resolveQuerySet")
    }

    insertDebugMarker(markerLabel: string): undefined {
        return notImplemented("insertDebugMarker")
    }

    pushDebugGroup(groupLabel: string): undefined {
        return notImplemented("pushDebugGroup")
    }

    popDebugGroup(): undefined {
        return notImplemented("popDebugGroup")
    }

    finish(descriptor: GPUCommandBufferDescriptor = {}): GPUCommandBuffer {
        const commands = this.commands;
        this.commands = []
        return new GLCommandBuffer(descriptor, commands)
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */

    private doCopyBufferToBuffer(
        source: GPUBuffer,
        sourceOffset: GPUSize64,
        destination: GPUBuffer,
        destinationOffset: GPUSize64,
        size: GPUSize64 = Math.min(source.size - sourceOffset, destination.size - destinationOffset)
    ): undefined {
        const src = source as GLBuffer
        const dst = destination as GLBuffer
        this.commands.push(() => {
            src.asSource(() => {
                dst.asDestination(() => {
                    this.device.context.copyBufferSubData(GL.COPY_READ_BUFFER, GL.COPY_WRITE_BUFFER, sourceOffset, destinationOffset, size)
                })
            })
        })
    }

}

export class GLCommandBuffer implements GPUCommandBuffer {
    
    readonly __brand = "GPUCommandBuffer"
    readonly label: string = this.descriptor.label ?? "Unlabeled Command Buffer"
    
    constructor(readonly descriptor: GPUCommandBufferDescriptor, readonly commands: (() => void)[]) {}

    executeCommands() {
        for (const command of this.commands) {
            command()
        }
    }

}
