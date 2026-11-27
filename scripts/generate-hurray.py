"""Build an offline arcade Hurray! cheer. Requires espeak-ng only when rebuilding."""
import math
from pathlib import Path
import random
import struct
import subprocess
import tempfile
import wave

rate = 22050
with tempfile.TemporaryDirectory() as directory:
    source = Path(directory) / 'hurray.wav'
    subprocess.run(['espeak-ng', '-v', 'en-us+m3', '-p', '52', '-s', '165', '-a', '130', '-w', str(source), 'Hurray!'], check=True)
    with wave.open(str(source), 'rb') as audio:
        source_rate = audio.getframerate()
        data = audio.readframes(audio.getnframes())
        voice = [sample[0] / 32768 for sample in struct.iter_unpack('<h', data)]

length = .35 + len(voice) / source_rate / .94 + .15
rng = random.Random(71)
samples = []
for i in range(int(rate * length)):
    t = i / rate
    value = 0.0
    # Three lightly offset voices make the short synthetic cheer feel playful.
    for delay, speed, strength in [(.28, .94, .6), (.34, 1.04, .22), (.39, 1.1, .15)]:
        index = (t - delay) * source_rate * speed
        if 0 <= index < len(voice) - 1:
            a = int(index)
            value += strength * (voice[a] + (voice[a + 1] - voice[a]) * (index - a))
    for onset, frequency, duration in [(0, 523.25, .13), (.12, 659.25, .13), (.24, 783.99, .15), (.38, 1046.5, .52)]:
        age = t - onset
        if 0 <= age < duration:
            envelope = min(age / .008, 1) * (1 - age / duration) ** 1.8
            value += .14 * envelope * (math.sin(2 * math.pi * frequency * age) + .2 * math.sin(4 * math.pi * frequency * age))
    for onset in [.15, .36, .58, .79, 1.03]:
        age = t - onset
        if 0 <= age < .075:
            value += .075 * rng.uniform(-1, 1) * math.exp(-age * 60) * min(age / .002, 1)
    samples.append(value)
peak = max(abs(sample) for sample in samples)
destination = Path(__file__).resolve().parents[1] / 'assets' / 'hurray.wav'
with wave.open(str(destination), 'wb') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(b''.join(struct.pack('<h', round(sample / peak * 27000)) for sample in samples))
print(destination)
