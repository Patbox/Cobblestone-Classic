import { StringRange, Suggestion } from '../index.ts';

export class Suggestions {
    static EMPTY = new Suggestions(StringRange.at(0), []);

    private range: StringRange;
    private suggestions: Suggestion[];

    constructor(range: StringRange, suggestions: Suggestion[]) {
        this.range = range;
        this.suggestions = suggestions;
    }

    getRange(): StringRange {
        return this.range;
    }

    getList(): Suggestion[] {
        return this.suggestions;
    }

    isEmpty(): boolean {
        return this.suggestions.length === 0;
    }

    static empty(): Promise<Suggestions> {
        return Promise.resolve(Suggestions.EMPTY);
    }

    static merge(command: string, input: Suggestions[]): Suggestions {
        if (input.length === 0) {
            return Suggestions.EMPTY;
        } else if (input.length === 1) {
            return input[0];
        }
        const texts = new Set<Suggestion>();
        for (const suggestions of input) {
            suggestions.getList().forEach(s => texts.add(s))
        }
        return Suggestions.create(command, Array.from(texts));
    }

    static create(command: string, suggestions: Suggestion[]): Suggestions {
        if (suggestions.length === 0) {
            return Suggestions.EMPTY;
        }
        let start = Infinity;
        let end = -Infinity;
        for (const suggestion of suggestions) {
            start = Math.min(suggestion.getRange().getStart(), start);
            end = Math.max(suggestion.getRange().getEnd(), end);
        }
        const range = new StringRange(start, end);
        const texts = [];
        for (const suggestion of suggestions) {
            texts.push(suggestion.expand(command, range));
        }
        return new Suggestions(range, texts.sort());
    }
}
