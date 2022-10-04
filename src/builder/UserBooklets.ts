import { backendManager } from '@/Backend';
import { blockchainProvider } from '@/chain/BlockchainProvider';
import { perUserStorable, perUserStore } from './PerUserStore';

class UserBookletsStore implements perUserStorable {
    user_id!: string;
    _booklets = [] as string[];
    _lastDataFetch: any;

    // Only store metadata on sets where something is happening. Rest are assumed live.
    metadata = {} as { [id: string]: {
        booklet_id: string,
        updates: {
            status: 'TENTATIVE' | 'TENTATIVE_DELETED',
            tx_hash: string,
            block: number | undefined,
            date: number,
        }[],
    }};

    _serialize() {
        const meta = {};
        for (const id in this.metadata)
            if (this.metadata[id].updates.length)
                meta[id] = this.metadata[id];
        return {
            booklets: this._booklets,
            metadata: meta,
        }
    }

    _deserialize(data: any) {
        this._booklets = data.booklets;
        this.metadata = data.metadata;
    }

    async fetchData() {
        try {
            this._lastDataFetch = await backendManager.fetch(`v1/user/booklets/${this.user_id}`);
            await this._updateData(this._lastDataFetch);
        } catch(ex) {
            console.error(ex);
        }
    }

    async _updateData(data: any) {
        this._booklets = data.booklets.slice();
        let reprocess = false;
        // Process metadata and clean it up where it seems like things went through (this is a bit optimistic but that's probably OK)
        for (const bookletId in this.metadata)
            for (let i = 0; i < this.metadata[bookletId].updates.length; ++i) {
                const update = this.metadata[bookletId].updates[i];
                if (update.block && update.block <= data.last_block) {
                    this.metadata[bookletId].updates.splice(i--, 1);
                    continue;
                }
                if (!update.block) {
                    const _status = blockchainProvider.value?.getTransactionStatus(update.tx_hash);
                    const _block = blockchainProvider.value?.getTransactionBlock(update.tx_hash);
                    const status = await _status;
                    const block = await _block;
                    if (status === 'REJECTED' || ((Date.now() - update.date) > 1000 * 60 * 60 && status === 'NOT_RECEIVED')) {
                        this.metadata[bookletId].updates.splice(i--, 1);
                        continue;
                    }
                    if (block) {
                        update.block = block;
                        if (update.block)
                            reprocess = true;
                    }
                }
                if (update.status === 'TENTATIVE_DELETED') {
                    const idx = this._booklets.indexOf(bookletId);
                    if (idx !== -1)
                        this._booklets.splice(idx, 1);
                } else
                    this._booklets.push(bookletId);
            }
        if (reprocess)
            this._updateData(data);
    }

    onEnter() {
        /*
        this.metadata['starknet_city_ongoing/spaceman'] = {
            booklet_id: 'starknet_city_ongoing/spaceman',
            updates: [{
                tx_hash: '0xcafe',
                block: undefined,
                status: 'TENTATIVE',
                date: Date.now(),
            },
            ],
        }
        */
        this.fetchData();
    }

    get booklets() {
        return this._booklets;
    }

    showOne(booklet_id: string, tx_hash: string, date?: number) {
        this._addOne('TENTATIVE', booklet_id, tx_hash, date);
    }

    hideOne(booklet_id: string, tx_hash: string, date?: number) {
        this._addOne('TENTATIVE_DELETED', booklet_id, tx_hash, date);

    }

    _addOne(status: 'TENTATIVE' | 'TENTATIVE_DELETED', booklet_id: string, tx_hash: string, date?: number) {
        if (!this.metadata[booklet_id])
            this.metadata[booklet_id] = {
                booklet_id: booklet_id,
                updates: [],
            }
        this.metadata[booklet_id].updates.push({
            status: status,
            tx_hash: tx_hash,
            block: undefined,
            date: date || Date.now(),
        })
        this._updateData(this._lastDataFetch);
    }
}

export const userBookletsStore = perUserStore(UserBookletsStore);
userBookletsStore.setup();
