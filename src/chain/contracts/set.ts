import type { Provider, Signer } from 'starknet';
import type { SetData } from '../../builder/SetData';
import { Contract, FunctionAbi } from 'starknet';

import { computeHashOnElements } from 'starknet/utils/hash';

import SetABI from './starknet-testnet/set_nft.json';
import { toBN } from 'starknet/utils/number';
import { maybeStore } from '../WalletLoading';

export default class SetContract {
    contract!: Contract;
    constructor(address: string, provider: Provider) {
        this.connect(address, provider);
    }

    connect(address: string, provider: Provider) {
        this.contract = new Contract(SetABI as FunctionAbi[], address, provider);
    }

    getAddress() {
        return this.contract.address;
    }

    // TODO: add URI
    precomputeTokenId(address: string, token_id_hint: string) {
        let hash = computeHashOnElements([address, token_id_hint]);
        hash = hash.substring(2).padStart(63, '0');
        // Hash is 0x prefixed string. JS numbers are not big enough to parse this, and I'm lazy.
        // We need to 0 out the last 59 bits, which means zero out the last 14 chars (14*4 = 56), and bit-and the 15th last with b1000 == 8.
        hash = (hash.substring(0, 48) + (parseInt(hash[48], 16) & 8).toString(16)).padEnd(63, '0');
        // Remove leading zeroes.
        if (hash[0] === '0')
            hash = hash.replace(/^0+/, '');
        return '0x' + hash;
    }

    _compress_shape_item(briq: any) {
        const two = toBN(2);
        let colorHex = '0x';
        for (let i = 0; i < briq.data.color.length; ++i)
            colorHex += briq.data.color.charCodeAt(i).toString(16).padStart(2, '0');
        const color_nft_material = toBN(briq.data.material).iadd(toBN(colorHex).imul(two.pow(toBN(136))))
        const x_y_z = (toBN(briq.pos[2]).add(two.pow(toBN(63)))).iadd(
            toBN(briq.pos[1]).add(two.pow(toBN(63))).mul(two.pow(toBN(64)))).iadd(
            toBN(briq.pos[0]).add(two.pow(toBN(63))).mul(two.pow(toBN(128))),
        )
        return ['0x' + color_nft_material.toString(16), '0x' + x_y_z.toString(16)]
    }

    _string_to_felt_string(data: string) {
        const encoded = new TextEncoder().encode(data);
        const out = ['0x'];
        encoded.forEach(x => {
            if (out[out.length - 1].length >= 32)
                out.push('0x');
            out[out.length - 1] += x.toString(16).padStart(2, '0');
        });
        if (out[out.length - 1] === '0x')
            out.pop();
        return out;
    }

    async assemble(owner: string, token_id_hint: string, data: any, booklet?: string) {
        const fungibles = {} as { [mat: string]: number };
        const nfts = [] as string[];
        const shapes = [];
        for (const briq of data.briqs) {
            shapes.push(this._compress_shape_item(briq));
            if (briq.data.id)
                nfts.push(briq.data.id);
            else {
                if (!fungibles[briq.data.material])
                    fungibles[briq.data.material] = 0;
                ++fungibles[briq.data.material];
            }
        }
        shapes.sort((a, b) => a[1].localeCompare(b[1], 'en'));
        const fts = [];
        for (const ft in fungibles)
            fts.push([ft, '' + fungibles[ft]]);

        const setName = this._string_to_felt_string(data.name);
        const setDescription = this._string_to_felt_string(data.description);
        await maybeStore.value!.ensureEnabled();
        return await this.contract.assemble_(owner, token_id_hint, setName, setDescription, fts, nfts, shapes, booklet ? [booklet] : []);
    }

    async disassemble(owner: string, token_id: string, set: SetData, booklet?: string) {
        const fungibles = {} as { [mat: string]: number };
        const nfts = [] as string[];
        set.forEach((briq, _) => {
            if (briq.id)
                nfts.push(briq.id);
            else {
                if (!fungibles[briq.material])
                    fungibles[briq.material] = 0;
                ++fungibles[briq.material];
            }
        });
        const fts = [];
        for (const ft in fungibles)
            fts.push([ft, '' + fungibles[ft]]);

        await maybeStore.value!.ensureEnabled();
        return await this.contract.disassemble_(owner, token_id, fts, nfts, booklet ? [booklet] : []);
    }

    async transferOneNFT(sender: string, recipient: string, token_id: string) {
        await maybeStore.value!.ensureEnabled();
        return await this.contract.transferFrom_(sender, recipient, token_id);
    }
}
