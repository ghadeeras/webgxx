import { GLBuffer } from "./buffer.js"
import { type GLDevice } from "./device.js"
import { GLBindGroup } from "./group.js"
import { GLRenderPipeline } from "./pipeline.js"
import { GLTextureView } from "./texture.js"
import { cast, color, expect, extend, GL, notImplemented, optional, type DeepRequired, type GLBufferBinding, type GLGroupDynamicBinding, type GLIndexBufferBinding, type SparseArray } from "./utils.js"

export class GLRenderPassEncoder implements GPURenderPassEncoder {
    
    private drawCalls: AbstractDrawCall[] = []
    
    private pipeline: GLRenderPipeline | null = null
    private groupBindings: SparseArray<GLGroupDynamicBinding> = []
    private vertexBufferBindings: SparseArray<GLBufferBinding> = []
    private indexBufferBinding: GLIndexBufferBinding | null = null
    private viewport: [number, number, number, number]

    private constructor(
        readonly device: GLDevice, 
        readonly descriptor: DefaultedGPURenderPassDescriptor, 
        private commandConsumer: (command: () => void) => void
    ) {
        this.viewport = inferViewport(descriptor)
    }

    static create(device: GLDevice, descriptor: GPURenderPassDescriptor, commandConsumer: (command: () => void) => void) {
        return new GLRenderPassEncoder(device, descriptorWithDefaults(descriptor), commandConsumer)
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */

    readonly __brand = "GPURenderPassEncoder"

    readonly label: string = this.descriptor.label

    setPipeline(pipeline: GPUPipelineBase): undefined {
        this.pipeline = cast(pipeline, GLRenderPipeline)
    }

    setIndexBuffer(buffer: GPUBuffer, indexFormat: GPUIndexFormat, offset: number = 0, size: number = buffer.size - offset): undefined {
        this.indexBufferBinding = { buffer: cast(buffer, GLBuffer), indexFormat, offset, size }
    }

    setVertexBuffer(
        slot: number, 
        buffer: GPUBuffer | null | undefined, 
        offset: number = 0, 
        size: number = (buffer?.size ?? offset)  - offset
    ): undefined {
        extend(this.vertexBufferBindings, slot)
        this.vertexBufferBindings[slot] = buffer !== null && buffer !== undefined
            ? { buffer: cast(buffer, GLBuffer), offset, size }
            : undefined
    }

    setBindGroup(
        index: number, 
        bindGroup: GPUBindGroup | null | undefined, 
        dynamicOffsetsData: Uint32Array | Iterable<GPUBufferDynamicOffset> = [], 
        dynamicOffsetsDataStart: number = 0, 
        dynamicOffsetsDataLength: number = 0
    ): undefined {
        extend(this.groupBindings, index)
        this.groupBindings[index] = bindGroup !== null && bindGroup !== undefined
            ? { bindGroup: cast(bindGroup, GLBindGroup), dynamicOffsetsData, dynamicOffsetsDataStart, dynamicOffsetsDataLength }
            : undefined
    }

    setViewport(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number): undefined {
        this.viewport = [x, y, width, height]
    }

    setBlendConstant(color: GPUColor | Iterable<number>): undefined {
        return notImplemented("setBlendConstant")
    }

    setScissorRect(x: GPUIntegerCoordinate, y: GPUIntegerCoordinate, width: GPUIntegerCoordinate, height: GPUIntegerCoordinate): undefined {
        return notImplemented("setScissorRect")
    }

    setStencilReference(reference: GPUStencilValue): undefined {
        return notImplemented("setStencilReference")
    }

    setImmediates(rangeOffset: GPUSize32, data: GPUAllowSharedBufferSource, dataOffset?: GPUSize64, dataSize?: GPUSize64): undefined {
        return notImplemented("setImmediates")
    }

    drawIndexedIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): undefined {
        return notImplemented("drawIndexedIndirect")
    }

    drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): undefined {
        return notImplemented("drawIndirect")
    }

    beginOcclusionQuery(queryIndex: GPUSize32): undefined {
        return notImplemented("beginOcclusionQuery")
    }

    endOcclusionQuery(): undefined {
        return notImplemented("endOcclusionQuery")
    }

    executeBundles(bundles: Iterable<GPURenderBundle>): undefined {
        return notImplemented("executeBundles")
    }

    insertDebugMarker(markerLabel: string): undefined {
        return notImplemented("insertDebugMarker")
    }

    popDebugGroup(): undefined {
        return notImplemented("popDebugGroup")
    }

    pushDebugGroup(groupLabel: string): undefined {
        return notImplemented("pushDebugGroup")
    }

    draw(vertexCount: number, instanceCount: number = 1, firstVertex: number = 0, firstInstance: number = 0): undefined {
        const pipeline = this.pipeline
        if (pipeline !== null) {
            this.drawCalls.push(new DrawCall(
                pipeline, 
                this.groupBindings, 
                this.vertexBufferBindings, 
                this.viewport, 
                vertexCount, 
                instanceCount, 
                firstVertex, 
                firstInstance
            ))
        }
    }

    drawIndexed(indexCount: number, instanceCount: number = 1, firstIndex: number = 0, baseVertex: number = 0, firstInstance: number = 0): undefined {
        const pipeline = this.pipeline
        if (pipeline !== null) {
            this.drawCalls.push(new IndexedDrawCall(
                pipeline, 
                this.groupBindings, 
                this.vertexBufferBindings, 
                this.indexBufferBinding ?? expect("Bound index buffer"), 
                this.viewport, 
                indexCount, 
                instanceCount, 
                firstIndex, 
                baseVertex, 
                firstInstance
            ))
        }
    }

    end(): undefined {
        if (this.drawCalls.length === 0) {
            return
        }
        const command = new RenderCommand(this.device, this.descriptor, this.drawCalls)
        this.drawCalls = []
        this.commandConsumer(() => command.run())
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}

class RenderCommand {

    constructor(
        private device: GLDevice, 
        private descriptor: DefaultedGPURenderPassDescriptor, 
        private drawCalls: AbstractDrawCall[]
    ) {}

    run() {
        const framebuffer = this.loadAttachments()
        const [x1, y1, x2, y2] = this.drawCalls
            .map(drawCall => drawCall.call())
            .reduce(([x1, y1, w1, h1], [x2, y2, w2, h2]) => [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1 + w1, x2 + w2), Math.max(y1 + h1, y2 + h2)])
        this.storeAttachments(framebuffer, [x1, y1, x2 - x1, y2 - y1])
    }

    private loadAttachments(): WebGLFramebuffer {
        const gl = this.device.context
        const framebuffer = gl.createFramebuffer()
        gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, framebuffer)
        for (const [index, attachment] of this.descriptor.colorAttachments.entries()) {
            if (attachment === null) {
                gl.framebufferTexture2D(GL.DRAW_FRAMEBUFFER, GL.COLOR_ATTACHMENT0 + index, GL.TEXTURE_2D, null, 0)
                continue
            }
            const view = attachment.view
            view.texture.attach(GL.DRAW_FRAMEBUFFER, GL.COLOR_ATTACHMENT0 + index, view.descriptor.baseArrayLayer, view.descriptor.baseMipLevel)
            if (attachment.loadOp === "clear") {
                gl.clearBufferfv(gl.COLOR, index, attachment.clearValue)
            }
        }
        if (this.descriptor.depthStencilAttachment !== undefined) {
            const attachment = this.descriptor.depthStencilAttachment
            const view = attachment.view
            view.texture.attach(GL.DRAW_FRAMEBUFFER, GL.DEPTH_ATTACHMENT, view.descriptor.baseArrayLayer, view.descriptor.baseMipLevel)
            if (attachment.depthLoadOp === "clear") {
                gl.clearDepth(attachment.depthClearValue)
                gl.clear(GL.DEPTH_BUFFER_BIT)
            }
        } else {
            gl.framebufferTexture2D(GL.DRAW_FRAMEBUFFER, GL.DEPTH_ATTACHMENT, GL.TEXTURE_2D, null, 0)
        }
        return framebuffer
    }

    private storeAttachments(framebuffer: WebGLFramebuffer, viewport: [number, number, number, number]) {
        const gl = this.device.context
        gl.deleteFramebuffer(framebuffer)
        for (const attachment of this.descriptor.colorAttachments) {
            if (attachment === null) {
                continue
            }
            const texture = attachment.view.texture
            const resolveTexture = attachment.resolveTarget.texture
            if (resolveTexture !== texture) {
                const [x, y, w, h] = viewport
                texture.blit([x, y], resolveTexture, [x, y], [w, h])
                resolveTexture.doneRendering(viewport)
            } else {
                texture.doneRendering(viewport)
            }
        }
        if (this.descriptor.depthStencilAttachment !== undefined) {
            this.descriptor.depthStencilAttachment.view.texture.doneRendering(viewport)
        }
    }

}

abstract class AbstractDrawCall {

    protected groupBindings: SparseArray<GLGroupDynamicBinding>
    protected vertexBufferBindings: SparseArray<GLBufferBinding>
    protected viewport: [number, number, number, number]

    constructor(
        protected pipeline: GLRenderPipeline,
        groupBindings: SparseArray<GLGroupDynamicBinding>,
        vertexBufferBindings: SparseArray<GLBufferBinding>,
        viewport: [number, number, number, number], 
    ) {
        this.groupBindings = [...groupBindings]
        this.vertexBufferBindings = [...vertexBufferBindings]
        this.viewport = [...viewport]
    }

    protected abstract doCall(): void;

    call() {
        this.doCall()
        return this.viewport
    }

}

class DrawCall extends AbstractDrawCall {

    constructor(
        pipeline: GLRenderPipeline,
        groupBindings: SparseArray<GLGroupDynamicBinding>,
        vertexBufferBindings: SparseArray<GLBufferBinding>,
        viewport: [number, number, number, number],

        private vertexCount: number,
        private instanceCount: number,
        private firstVertex: number,
        private firstInstance: number,
    ) {
        super(pipeline, groupBindings, vertexBufferBindings, viewport)
        if (firstInstance !== 0) {
            expect(`Support for first instance = ${firstInstance} > 0`)
        }
    }

    protected doCall(): void {
        this.pipeline.draw(
            this.groupBindings, 
            this.vertexBufferBindings, 
            this.viewport, 
            this.vertexCount, 
            this.instanceCount, 
            this.firstVertex, 
            this.firstInstance
        )
    }

}

class IndexedDrawCall extends AbstractDrawCall {

    constructor(
        pipeline: GLRenderPipeline,
        groupBindings: SparseArray<GLGroupDynamicBinding>,
        vertexBufferBindings: SparseArray<GLBufferBinding>,
        private indexBufferBinding: GLIndexBufferBinding,
        viewport: [number, number, number, number],

        private indexCount: number,
        private instanceCount: number,
        private firstIndex: number,
        private baseVertex: number,
        private firstInstance: number,
    ) {
        super(pipeline, groupBindings, vertexBufferBindings, viewport)
        if (firstIndex != 0) {
            expect(`Support for first index = ${firstIndex} > 0`)
        }
        if (baseVertex != 0) {
            expect(`Support for base vertex = ${baseVertex} > 0`)
        }
        if (firstInstance != 0) {
            expect(`Support for first instance = ${firstInstance} > 0`)
        }
    }

    protected doCall(): void {
        this.pipeline.drawIndexed(
            this.groupBindings, 
            this.vertexBufferBindings, 
            this.indexBufferBinding, 
            this.viewport, 
            this.indexCount, 
            this.instanceCount, 
            this.firstIndex, 
            this.baseVertex, 
            this.firstInstance
        )
    }
    
}

type DefaultedGPURenderPassDescriptor = ReturnType<typeof descriptorWithDefaults>

function descriptorWithDefaults(descriptor: GPURenderPassDescriptor) {
    return {
        label: descriptor.label ?? "[Unlabeled Render Pass]",
        colorAttachments: descriptor.colorAttachments.map(a => a === null ? a : {
            ...a,
            clearValue: color(a.clearValue ?? []),
            depthSlice: a.depthSlice ?? 0,
            view: asGLTextureView(a.view),
            resolveTarget: asGLTextureView(a.resolveTarget ?? a.view)
        } satisfies DeepRequired<GPURenderPassColorAttachment>),
        depthStencilAttachment: optional(descriptor.depthStencilAttachment, depthStencilAttachment => ({
            depthLoadOp: depthStencilAttachment.depthLoadOp ?? "clear",
            depthClearValue: depthStencilAttachment.depthClearValue ?? 0,
            depthStoreOp: depthStencilAttachment.depthStoreOp ?? "discard",
            depthReadOnly: depthStencilAttachment.depthReadOnly ?? false,
            stencilLoadOp: depthStencilAttachment.stencilLoadOp ?? "clear",
            stencilClearValue: depthStencilAttachment.stencilClearValue ?? 0,
            stencilStoreOp: depthStencilAttachment.stencilStoreOp ?? "discard",
            stencilReadOnly: depthStencilAttachment.stencilReadOnly ?? false,
            view: asGLTextureView(depthStencilAttachment.view),
        })),
        maxDrawCount: descriptor.maxDrawCount ?? Number.MAX_SAFE_INTEGER,
        occlusionQuerySet: descriptor.occlusionQuerySet,
        timestampWrites: optional(descriptor.timestampWrites, timestampWrites => ({
            querySet: timestampWrites.querySet,
            beginningOfPassWriteIndex: 0,
            endOfPassWriteIndex: 0,
            ...descriptor.timestampWrites,
        }))
    } satisfies GPURenderPassDescriptor
}

function asGLTextureView(view: GPUTexture | GPUTextureView) {
    return cast("createView" in view ? view.createView() : view, GLTextureView)
}

function inferViewport(descriptor: DefaultedGPURenderPassDescriptor): [number, number, number, number] {
    let minWidth = Number.MAX_SAFE_INTEGER
    let minHeight = Number.MAX_SAFE_INTEGER
    let maxWidth = 0
    let maxHeight = 0
    for (const attachment of descriptor.colorAttachments) {
        if (attachment === null) {
            continue
        }
        const view = attachment.view
        minWidth = Math.min(minWidth, view.texture.width)
        minHeight = Math.min(minHeight, view.texture.height)
        maxWidth = Math.max(maxWidth, view.texture.width)
        maxHeight = Math.max(maxHeight, view.texture.height)
    }
    if (descriptor.depthStencilAttachment !== undefined) {
        const view = descriptor.depthStencilAttachment.view
        minWidth = Math.min(minWidth, view.texture.width)
        minHeight = Math.min(minHeight, view.texture.height)
        maxWidth = Math.max(maxWidth, view.texture.width)
        maxHeight = Math.max(maxHeight, view.texture.height)
    }
    return minWidth === maxWidth && minHeight === maxHeight
        ? [0, 0, minWidth, minHeight]
        : expect("Attachments of same size")
}
