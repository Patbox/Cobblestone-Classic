// https://github.com/andyhall/murmur-numbers

export function makeMurmur(seed: number) {
    const c1 = 0xcc9e2d51
    const c2 = 0x1b873593
    const maxInt = Math.pow(2, 32)

    return function murmur32(..._args: number[]) {

        const numargs = arguments.length
        let h1 = seed

        for (let i = 0; i < numargs; i++) {
            let k1 = arguments[i] | 0

            k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff
            k1 = (k1 << 15) | (k1 >>> 17)
            k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff

            h1 ^= k1
            h1 = (h1 << 13) | (h1 >>> 19)
            const h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff
            h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16))
        }

        h1 ^= numargs

        h1 ^= h1 >>> 16
        h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff
        h1 ^= h1 >>> 13
        h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff
        h1 ^= h1 >>> 16

        return (h1 >>> 0) / maxInt
    }
}