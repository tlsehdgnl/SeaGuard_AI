import Foundation
import FoundationModels

@Generable
struct VisitOrder {
    @Guide(description: "Every input stop index exactly once, in the proposed visit order.")
    var order: [Int]
}

guard SystemLanguageModel.default.availability == .available else { exit(2) }
let input = FileHandle.standardInput.readDataToEndOfFile()
let session = LanguageModelSession(instructions: """
Plan a Donghae sightseeing itinerary from the fixed origin. Use the coordinates and
preferences to minimize backtracking. Every stop must appear exactly once.
Return only the integer indices of the stops. The origin is not a stop index.
""")
let answer = try await session.respond(to: String(decoding: input, as: UTF8.self),
                                       generating: VisitOrder.self)
FileHandle.standardOutput.write(try JSONEncoder().encode(answer.content.order))
