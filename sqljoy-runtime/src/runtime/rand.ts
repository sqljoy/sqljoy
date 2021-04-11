let S0: number = Math.random() * 0xffffffff, S1: number = Math.random() * 0xffffffff;

export function seedRandom(now: number) {
    S0 = now & 0xffffffff;
    S1 = S0 ^ 2991259969;
}

Math.random = (): number => {
    // From Go fastrand xorshift64+
    // Chosen because it can be implemented efficiently in JavaScript using 32bit integers
    // It's cheaper for low-cost functions to be implemented in JavaScript and rely on the
    // JIT for code generation than to call into Rust.
    let s0 = S1; // load s1 into s0
    let s1 = S0;
    s1 ^= s1 << 17;
    s1 = s1 ^ s0 ^ s1>>7 ^ s0>>16;
    S0 = s0;
    S1 = s1;
    // Math.pow(2, -32) = 2.3283064365386963e-10
    // Math.pow(2, -52) = 2.220446049250313e-16
    return s1 * 2.3283064365386963e-10 + (s0 >>> 12) * 2.220446049250313e-16;
};
