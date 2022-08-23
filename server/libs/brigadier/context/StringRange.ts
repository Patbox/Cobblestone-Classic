export class StringRange {
    private start: number;
    private end: number;

    constructor(start: number, end: number) {
        this.start = start;
        this.end = end;
    }

    static at(pos: number): StringRange {
        return new StringRange(pos, pos);
    }

    static encompassing(a: StringRange, b: StringRange): StringRange {
        const start = Math.min(a.getStart(), b.getStart());
        const end = Math.max(a.getEnd(), b.getEnd());
        return new StringRange(start, end)
    }

    getStart(): number {
        return this.start;
    }

    getEnd(): number {
        return this.end;
    }

    isEmpty(): boolean {
        return this.start === this.end;
    }

    getLength(): number {
        return this.end - this.start;
    }
}
