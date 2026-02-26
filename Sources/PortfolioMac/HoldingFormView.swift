import SwiftUI

enum HoldingFormMode {
    case create
    case edit(Holding)

    var title: String {
        switch self {
        case .create:
            return "Add Holding"
        case .edit:
            return "Edit Holding"
        }
    }

    var baseHolding: Holding? {
        switch self {
        case .create:
            return nil
        case .edit(let holding):
            return holding
        }
    }
}

struct HoldingFormView: View {
    let mode: HoldingFormMode
    let onSave: (Holding) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var symbol: String
    @State private var displayName: String
    @State private var market: Market
    @State private var sector: Sector
    @State private var term: InvestmentTerm
    @State private var costBasis: Double
    @State private var currentValue: Double
    @State private var targetWeightText: String
    @State private var note: String
    @State private var errorText: String?

    init(mode: HoldingFormMode, onSave: @escaping (Holding) -> Void) {
        self.mode = mode
        self.onSave = onSave

        let seed = mode.baseHolding
        _symbol = State(initialValue: seed?.symbol ?? "")
        _displayName = State(initialValue: seed?.displayName ?? "")
        _market = State(initialValue: seed?.market ?? .kr)
        _sector = State(initialValue: seed?.sector ?? .index)
        _term = State(initialValue: seed?.term ?? .short)
        _costBasis = State(initialValue: seed?.costBasis ?? 0)
        _currentValue = State(initialValue: seed?.currentValue ?? 0)
        _targetWeightText = State(initialValue: seed?.targetWeight.map { String(format: "%.2f", $0) } ?? "")
        _note = State(initialValue: seed?.note ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(mode.title)
                .font(.title2.bold())

            Form {
                HStack {
                    Text("Symbol")
                    Spacer()
                    TextField("AAPL / 005930", text: $symbol)
                        .frame(width: 220)
                }

                HStack {
                    Text("Name")
                    Spacer()
                    TextField("Display name", text: $displayName)
                        .frame(width: 220)
                }

                HStack {
                    Text("Market")
                    Spacer()
                    Picker("Market", selection: $market) {
                        ForEach(Market.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 220)
                }

                HStack {
                    Text("Sector")
                    Spacer()
                    Picker("Sector", selection: $sector) {
                        ForEach(Sector.allCases) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                    .frame(width: 220)
                }

                HStack {
                    Text("Term")
                    Spacer()
                    Picker("Term", selection: $term) {
                        ForEach(InvestmentTerm.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 220)
                }

                HStack {
                    Text("Cost Basis")
                    Spacer()
                    TextField("0", value: $costBasis, format: .number.grouping(.automatic))
                        .frame(width: 220)
                }

                HStack {
                    Text("Current Value")
                    Spacer()
                    TextField("0", value: $currentValue, format: .number.grouping(.automatic))
                        .frame(width: 220)
                }

                HStack {
                    Text("Target Ratio (%)")
                    Spacer()
                    TextField("Optional", text: $targetWeightText)
                        .frame(width: 220)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Comment")
                    TextField("Memo", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                        .textFieldStyle(.roundedBorder)
                }
            }
            .formStyle(.grouped)

            if let errorText {
                Text(errorText)
                    .foregroundStyle(.red)
                    .font(.footnote)
            }

            HStack {
                Spacer()
                Button("Cancel") {
                    dismiss()
                }
                Button("Save") {
                    save()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 520, height: 590)
    }

    private func save() {
        let trimmedSymbol = symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !trimmedSymbol.isEmpty else {
            errorText = "Symbol is required."
            return
        }

        guard costBasis >= 0, currentValue >= 0 else {
            errorText = "Amount values cannot be negative."
            return
        }

        let parsedTarget = parseTargetWeight()
        if let parsedTarget, !(0...100).contains(parsedTarget) {
            errorText = "Target ratio must be between 0 and 100."
            return
        }

        let existingID = mode.baseHolding?.id ?? UUID()
        let normalizedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let holding = Holding(
            id: existingID,
            symbol: trimmedSymbol,
            displayName: normalizedName.isEmpty ? trimmedSymbol : normalizedName,
            market: market,
            sector: sector,
            term: term,
            costBasis: costBasis,
            currentValue: currentValue,
            targetWeight: parsedTarget,
            note: normalizedNote
        )

        onSave(holding)
        dismiss()
    }

    private func parseTargetWeight() -> Double? {
        let cleaned = targetWeightText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return nil }
        return Double(cleaned)
    }
}
