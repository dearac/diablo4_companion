using System.Text.Json;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;

// ============================================================
// WinOcr.exe — Windows OCR CLI
// ============================================================
// A minimal console app that runs the Windows.Media.Ocr engine
// on an image file and outputs structured JSON to stdout.
//
// Usage: WinOcr.exe <image-path> [--lang en-US]
//
// Output (JSON):
// {
//   "text": "full recognized text",
//   "lines": [
//     { "text": "line text", "words": [{ "text": "word", "bbox": { "x", "y", "w", "h" } }] }
//   ]
// }
// ============================================================

if (args.Length < 1)
{
    Console.Error.WriteLine("Usage: WinOcr.exe <image-path> [--lang <language-tag>]");
    Environment.Exit(1);
}

var imagePath = Path.GetFullPath(args[0]);
if (!File.Exists(imagePath))
{
    Console.Error.WriteLine($"File not found: {imagePath}");
    Environment.Exit(1);
}

// Parse optional --lang argument (default: en-US)
var langTag = "en-US";
for (int i = 1; i < args.Length - 1; i++)
{
    if (args[i] == "--lang") langTag = args[i + 1];
}

try
{
    var language = new Windows.Globalization.Language(langTag);
    if (!OcrEngine.IsLanguageSupported(language))
    {
        Console.Error.WriteLine($"Language not supported: {langTag}");
        Console.Error.WriteLine("Available: " + string.Join(", ",
            OcrEngine.AvailableRecognizerLanguages.Select(l => l.LanguageTag)));
        Environment.Exit(1);
    }

    var engine = OcrEngine.TryCreateFromLanguage(language);
    if (engine == null)
    {
        Console.Error.WriteLine("Failed to create OCR engine.");
        Environment.Exit(1);
    }

    // Load image as SoftwareBitmap
    var file = await StorageFile.GetFileFromPathAsync(imagePath);
    using var stream = await file.OpenAsync(FileAccessMode.Read);
    var decoder = await BitmapDecoder.CreateAsync(stream);
    var bitmap = await decoder.GetSoftwareBitmapAsync(
        BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);

    // Run OCR
    var result = await engine.RecognizeAsync(bitmap);

    // Build JSON output
    var output = new
    {
        text = result.Text,
        lines = result.Lines.Select(line => new
        {
            text = line.Text,
            words = line.Words.Select(word => new
            {
                text = word.Text,
                bbox = new
                {
                    x = word.BoundingRect.X,
                    y = word.BoundingRect.Y,
                    w = word.BoundingRect.Width,
                    h = word.BoundingRect.Height
                }
            })
        })
    };

    Console.WriteLine(JsonSerializer.Serialize(output, new JsonSerializerOptions
    {
        WriteIndented = false
    }));
}
catch (Exception ex)
{
    Console.Error.WriteLine($"OCR failed: {ex.Message}");
    Environment.Exit(1);
}
