import { 
    Suggestion,
    Suggestions,
    StringRange
} from '../index.ts';

export class SuggestionsBuilder {
    private input: string;
    private start: number;
    private remaining: string;
    private result: Suggestion[];

    constructor(input: string, start: number) {
        this.input = input;
        this.start = start;
        this.remaining = input.substring(start);
        this.result = [];
    }

    getInput(): string {
        return this.input;
    }

    getStart(): number {
        return this.start;
    }

    getRemaining(): string {
        return this.remaining;
    }

    build(): Suggestions {
        return Suggestions.create(this.input, this.result);
    }

    buildPromise(): Promise<Suggestions> {
        return Promise.resolve(this.build());
    }

    suggest(text: string, tooltip?: string): SuggestionsBuilder {
        if (text === this.remaining) {
            return this;
        }
        this.result.push(new Suggestion(new StringRange(this.start, this.input.length), text, tooltip))
        return this;
    }

    add(other: SuggestionsBuilder): SuggestionsBuilder {
        this.result.concat(other.result);
        return this;
    }

    createOffset(start: number): SuggestionsBuilder {
        return new SuggestionsBuilder(this.input, start);
    }

    restart(start: number): SuggestionsBuilder {
        return new SuggestionsBuilder(this.input, this.start);
    }
}
