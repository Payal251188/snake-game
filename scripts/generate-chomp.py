"""Generate the short, speaker-friendly chomp effect using only the standard library."""
import math
from pathlib import Path
import random
import struct
import wave

rate = 44100
rng = random.Random(19)
samples = []
phase = 0.0
filtered_noise = 0.0
for i in range(int(rate * 0.28)):
    t = i / rate
    value = 0.0
    # A noisy jaw snap followed by a lower, rounded bite.
    for onset, duration, high, low, strength in [(0, 0.13, 950, 210, 1), (0.105, 0.175, 720, 150, 0.85)]:
        age = t - onset
        if 0 <= age < duration:
            progress = age / duration
            frequency = high * (low / high) ** progress
            phase += 2 * math.pi * frequency / rate
            filtered_noise = 0.55 * filtered_noise + 0.45 * rng.uniform(-1, 1)
            envelope = min(age / 0.004, 1) * (1 - progress) ** 1.3
            crunch = math.tanh(2.5 * math.sin(phase)) + 0.5 * filtered_noise
            value += strength * envelope * crunch
    samples.append(value)
peak = max(abs(s) for s in samples)
destination = Path(__file__).resolve().parents[1] / 'assets' / 'chomp.wav'
with wave.open(str(destination), 'wb') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(b''.join(struct.pack('<h', round(s / peak * 30000)) for s in samples))
print(destination)
