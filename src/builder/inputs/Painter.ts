import { MouseInputState } from './BuilderInputState';
import { previewCube } from '../graphics/PreviewCube'
import { inputStore } from "./InputStore";
import { store } from '../../store/Store'
import * as THREE from 'three'

export class PainterInput extends MouseInputState
{
    onEnter() {
        previewCube.scale.set(1.1, 1.1, 1.1);
        previewCube.visible = true;
    }

    onExit() {
        previewCube.visible = false;
        previewCube.scale.set(1, 1, 1);
    }

    onPointerMove(event: PointerEvent)
    {
        let pos = this.getIntersectionPos(this.curX, this.curY, true);
        if (!pos)
            return;

        previewCube.position.set(Math.floor(pos[0]) + 0.5, Math.floor(pos[1]) + 0.5, Math.floor(pos[2]) + 0.5);
        (previewCube.material as THREE.MeshPhongMaterial).color = new THREE.Color(inputStore.colorMap[inputStore.currentColor].color);
    }

    onPointerDown(event: PointerEvent)
    {
        if (event.shiftKey)
            this.fsm.switchTo("paint_multi", { x: event.clientX, y: event.clientY });
    }

    onPointerUp(event: PointerEvent)
    {
        let mov = Math.abs(event.clientX - this.lastClickX) + Math.abs(event.clientY - this.lastClickY);
        if (mov > 10)
            return;
        
        let pos = this.getIntersectionPos(this.curX, this.curY, true);
        if (!pos || pos[1] < 0)
            return;

        store.dispatch("builderData/set_briq_color", { pos: pos, color: inputStore.colorMap[inputStore.currentColor].color });
        // Update preview cube.
        this._onPointerMove(event);
    }
}

export class PainterMultiInput extends MouseInputState
{
    lastClickPos!: [number, number, number];

    onEnter(data: any) {
        this.curX = data.x;
        this.curY = data.y;

        this.lastClickPos = this.getIntersectionPos(this.curX, this.curY, true)!;
        if (!this.lastClickPos)
            throw new Error("Error: PainterMultiInput must have a well defined event position on entry");
        
        this.fsm.orbitControls.enabled = false;
        previewCube.visible = true;
    }

    onExit() {
        previewCube.visible = false;
        this.fsm.orbitControls.enabled = true;
    }

    onPointerMove(event: PointerEvent)
    {
        let pos = this.getIntersectionPos(this.curX, this.curY, true);
        if (!pos)
            return;

        previewCube.scale.set(Math.abs(this.lastClickPos[0] - pos[0]) + 1.1, Math.abs(this.lastClickPos[1] - pos[1]) + 1.1, Math.abs(this.lastClickPos[2] - pos[2]) + 1.1);
        previewCube.position.set(
            ((this.lastClickPos[0] + pos[0]) / 2) + 0.5,
            ((this.lastClickPos[1] + pos[1]) / 2) + 0.5,
            ((this.lastClickPos[2] + pos[2]) / 2) + 0.5,
        );
    }

    onPointerUp(event: PointerEvent)
    {
        let pos = this.getIntersectionPos(this.curX, this.curY, true);
        if (!pos)
            return;

        for (let x = Math.min(this.lastClickPos[0], pos[0]); x <= Math.max(this.lastClickPos[0], pos[0]); ++x)
            for (let y = Math.min(this.lastClickPos[1], pos[1]); y <= Math.max(this.lastClickPos[1], pos[1]); ++y)
                for (let z = Math.min(this.lastClickPos[2], pos[2]); z <= Math.max(this.lastClickPos[2], pos[2]); ++z)
                {
                    if (store.state.builderData.currentSet.getAt(x, y, z))
                        store.dispatch("builderData/set_briq_color", { pos: [x, y, z], color: inputStore.colorMap[inputStore.currentColor].color });
                }
        this.fsm.switchTo("paint");
    }
}
