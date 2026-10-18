// Reads lines "name<TAB>ssml" from stdin and writes name.caf for each,
// using Apple's speech engine with SSML (so IPA phoneme tags work).
// Usage: swift speak.swift [VoiceName] < list.tsv
import AVFoundation

let voiceName = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Samantha"
let voice = AVSpeechSynthesisVoice.speechVoices().first { $0.name == voiceName && $0.language.hasPrefix("en") }
if voice == nil { FileHandle.standardError.write("voice \(voiceName) not found\n".data(using: .utf8)!) }
let synth = AVSpeechSynthesizer()

while let line = readLine() {
    let parts = line.components(separatedBy: "\t")
    if parts.count < 2 { continue }
    let name = parts[0], ssml = parts[1]
    guard let utterance = AVSpeechUtterance(ssmlRepresentation: ssml) else {
        print("\(name): bad SSML"); continue
    }
    if let voice = voice { utterance.voice = voice }
    var file: AVAudioFile? = nil
    var finished = false
    let started = Date()
    synth.write(utterance) { buffer in
        guard let pcm = buffer as? AVAudioPCMBuffer else { return }
        if pcm.frameLength == 0 { finished = true; return }
        if file == nil {
            file = try? AVAudioFile(forWriting: URL(fileURLWithPath: name + ".caf"),
                                    settings: pcm.format.settings,
                                    commonFormat: pcm.format.commonFormat,
                                    interleaved: pcm.format.isInterleaved)
        }
        try? file?.write(from: pcm)
    }
    while !finished && Date().timeIntervalSince(started) < 10 {
        RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    file = nil
    print("\(name): \(finished ? "ok" : "timeout")")
}
