// src/merkle.js - Merkle Tree для CRCHCN токена
const crypto = require('crypto');

class MerkleTree {
    constructor(leaves) {
        this.leaves = leaves.map(l => this.hash(l));
        this.levels = this.buildTree(this.leaves);
    }
    
    hash(data) {
        if (typeof data === 'string') {
            data = Buffer.from(data, 'utf8');
        }
        return crypto.createHash('sha256').update(data).digest();
    }
    
    hashHex(data) {
        return this.hash(data).toString('hex');
    }
    
    buildTree(leaves) {
        if (leaves.length === 0) return [];
        if (leaves.length === 1) return [leaves];
        
        const levels = [leaves];
        let currentLevel = leaves;
        
        while (currentLevel.length > 1) {
            const nextLevel = [];
            
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
                
                const combined = Buffer.concat([left, right]);
                nextLevel.push(this.hash(combined));
            }
            
            levels.push(nextLevel);
            currentLevel = nextLevel;
        }
        
        return levels;
    }
    
    getRoot() {
        return this.levels[this.levels.length - 1][0];
    }
    
    getRootHex() {
        return this.getRoot().toString('hex');
    }
    
    getProof(leaf) {
        const leafHash = this.hash(leaf);
        let index = this.leaves.findIndex(l => l.equals(leafHash));
        
        if (index === -1) return null;
        
        const proof = [];
        
        for (let level = 0; level < this.levels.length - 1; level++) {
            const levelNodes = this.levels[level];
            const isRightNode = index % 2 === 1;
            const siblingIndex = isRightNode ? index - 1 : index + 1;
            
            if (siblingIndex < levelNodes.length) {
                proof.push({
                    position: isRightNode ? 'left' : 'right',
                    data: levelNodes[siblingIndex]
                });
            }
            
            index = Math.floor(index / 2);
        }
        
        return proof;
    }
    
    verifyProof(leaf, proof, root) {
        const leafHash = this.hash(leaf);
        let currentHash = leafHash;
        
        for (const { position, data } of proof) {
            if (position === 'left') {
                currentHash = this.hash(Buffer.concat([data, currentHash]));
            } else {
                currentHash = this.hash(Buffer.concat([currentHash, data]));
            }
        }
        
        return currentHash.equals(root);
    }
}

module.exports = MerkleTree;
