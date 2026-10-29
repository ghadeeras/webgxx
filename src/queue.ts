import { GLBuffer } from "./buffer.js"
import { GLCommandBuffer } from "./commands.js"
import { GLDevice } from "./device.js"
import { GLTexture } from "./texture.js"
import { cast, expect, GL, type DeepRequired } from "./utils.js"

export class GLQueue implements GPUQueue {

    constructor(readonly device: GLDevice, readonly descriptor: DeepRequired<GPUQueueDescriptor>) {}

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUQueue"

    readonly label: string = this.descriptor.label

    async onSubmittedWorkDone(): Promise<undefined> {
        const gl = this.device.context
        const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) ?? expect("Synchronization fence creation")
        gl.flush()
        while (true) {
            await new Promise(requestAnimationFrame)
            const status = gl.clientWaitSync(fence, 0, 0)
            switch (status) {
                case GL.ALREADY_SIGNALED: {
                    return
                }
                case GL.CONDITION_SATISFIED: {
                    return
                }
                case GL.WAIT_FAILED: {
                    expect("Commands completion")
                }
            }
        }
    }
    
    submit(commandBuffers: Iterable<GPUCommandBuffer>): undefined {
        for (const b of commandBuffers) {
            const buffer = cast(b, GLCommandBuffer)
            buffer.executeCommands()
        }
    }

    copyExternalImageToTexture(source: GPUCopyExternalImageSourceInfo, destination: GPUCopyExternalImageDestInfo, copySize: GPUExtent3DStrict): undefined {
        const glTexture = cast(destination.texture, GLTexture)
        glTexture.copyExternalImageToTexture(source, destination, copySize)
    }
    
    writeBuffer(buffer: GPUBuffer, bufferOffset: GPUSize64, data: GPUAllowSharedBufferSource, dataOffset?: GPUSize64, size?: GPUSize64): undefined {
        const glBuffer = cast(buffer, GLBuffer)
        glBuffer.writeBuffer(bufferOffset, data, dataOffset, size)
    }

    writeTexture(destination: GPUTexelCopyTextureInfo, data: GPUAllowSharedBufferSource, dataLayout: GPUTexelCopyBufferLayout, size: GPUExtent3DStrict): undefined {
        const glTexture = cast(destination.texture, GLTexture)
        glTexture.writeTexture(destination, data, dataLayout, size)
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */

}
