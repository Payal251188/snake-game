"""Build Snake Club's original looping music (Python stdlib + FFmpeg)."""
from array import array
from pathlib import Path
import math
import random
import subprocess
import tempfile
import wave

RATE = 44100
STEP = 0.24
MELODY = [76, 79, 81, 79, 74, 76, 72, 74, 76, 79, 84, 81, 79, 76, 74, 72]
samples = [0.0] * round(RATE * STEP * 64)
rng = random.Random(42)


def add_note(start, midi, duration, amplitude, bass=False):
    frequency = 440 * 2 ** ((midi - 69) / 12)
    for i in range(round(duration * RATE)):
        t = i / RATE
        envelope = min(1, t / 0.008) * math.exp(-t * (5 if bass else 9))
        envelope *= min(1, (duration - t) / 0.02)
        phase = 2 * math.pi * frequency * t
        signal = math.sin(phase) + 0.25 * math.sin(2 * phase) + 0.1 * math.sin(3 * phase)
        samples[(round(start * RATE) + i) % len(samples)] += amplitude * envelope * signal


for step in range(64):
    add_note(step * STEP, MELODY[step % 16] + (0 if step < 32 else -12), 0.32, 0.38)
    if step % 4 == 0:
        add_note(step * STEP, [48, 45, 53, 55][(step // 4) % 4], 0.7, 0.44, True)
    for i in range(round(0.09 * RATE)):
        t = i / RATE
        index = (round(step * STEP * RATE) + i) % len(samples)
        samples[index] += rng.uniform(-1, 1) * math.exp(-60 * t) * 0.055
        if step % 4 == 0:
            samples[index] += math.sin(2 * math.pi * (70 * t + 2 * (1 - math.exp(-35 * t)))) * math.exp(-35 * t) * 0.3

peak = max(abs(value) for value in samples)
encoded = array('h', (round(value / peak * 0.88 * 32767) for value in samples))
destination = Path(__file__).resolve().parents[1] / 'assets' / 'snake-groove.mp3'
destination.parent.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    wav = Path(tmp) / 'music.wav'
    with wave.open(str(wav), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(encoded.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '128k', str(destination)], check=True)
print(destination)
