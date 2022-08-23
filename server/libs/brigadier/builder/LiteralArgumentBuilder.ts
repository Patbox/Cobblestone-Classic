import { ArgumentBuilder, Command, CommandNode, LiteralCommandNode, RedirectModifier } from '../index.ts';

export class LiteralArgumentBuilder<S> extends ArgumentBuilder<S, LiteralArgumentBuilder<S>> {
    private literal: string;

    constructor(literal: string) {
        super();
        this.literal = literal
    }

    getThis(): LiteralArgumentBuilder<S> {
        return this;
    }

    getLiteral(): string {
        return this.literal;
    }
    
    build(): LiteralCommandNode<S> {
        const result = new LiteralCommandNode<S>(this.getLiteral(), <Command<S>> this.getCommand(), this.getRequirement(), <CommandNode<S>> this.getRedirect(), <RedirectModifier<S>> this.getRedirectModifier(), this.isFork());
        for (const argument of this.getArguments()) {
            result.addChild(argument);
        }
        return result;
    }
}

export function literal<T>(name: string): LiteralArgumentBuilder<T> {
    return new LiteralArgumentBuilder<T>(name);
}
