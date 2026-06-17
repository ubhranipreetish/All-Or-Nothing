/**
 * Validation (Composite pattern)
 *
 * Every rule — whether a single leaf check or a whole group — implements the
 * same `Validator` interface and returns the first error message or `null`.
 * Because a `CompositeValidator` is itself a `Validator`, callers treat one rule
 * and a tree of rules uniformly. Services build a composite, run it once, and
 * throw a 400 with the returned message.
 */
export interface Validator {
    /** Returns an error message if the rule fails, otherwise null. */
    validate(): string | null;
}

/** Composite node: aggregates child validators and short-circuits on the first failure. */
export class CompositeValidator implements Validator {
    private readonly rules: Validator[] = [];

    add(rule: Validator): this {
        this.rules.push(rule);
        return this;
    }

    validate(): string | null {
        for (const rule of this.rules) {
            const error = rule.validate();
            if (error) return error;
        }
        return null;
    }
}

// ----- Leaf validators -----

export class RequiredValidator implements Validator {
    constructor(private readonly value: unknown, private readonly message: string) {}
    validate(): string | null {
        const missing =
            this.value === undefined || this.value === null || this.value === "";
        return missing ? this.message : null;
    }
}

export class PositiveNumberValidator implements Validator {
    constructor(private readonly value: unknown, private readonly message: string) {}
    validate(): string | null {
        return typeof this.value !== "number" || this.value <= 0 ? this.message : null;
    }
}

export class NumberRangeValidator implements Validator {
    constructor(
        private readonly value: unknown,
        private readonly min: number,
        private readonly max: number,
        private readonly message: string
    ) {}
    validate(): string | null {
        if (typeof this.value !== "number") return this.message;
        return this.value < this.min || this.value > this.max ? this.message : null;
    }
}
