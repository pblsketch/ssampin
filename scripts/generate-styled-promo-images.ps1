Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-Color {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Hex,
    [int]$Alpha = 255
  )

  $clean = $Hex.TrimStart('#')
  $r = [Convert]::ToInt32($clean.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($clean.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($clean.Substring(4, 2), 16)
  return [System.Drawing.Color]::FromArgb($Alpha, $r, $g, $b)
}

function U {
  param([string]$Escaped)
  return [regex]::Unescape($Escaped)
}

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-RoundedRect {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Brush]$Brush,
    [System.Drawing.Pen]$Pen,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-RoundedRectPath -X $X -Y $Y -Width $Width -Height $Height -Radius $Radius
  try {
    if ($Brush) { $Graphics.FillPath($Brush, $path) }
    if ($Pen) { $Graphics.DrawPath($Pen, $path) }
  } finally {
    $path.Dispose()
  }
}

function Draw-ShadowedPanel {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius,
    [string]$FillHex,
    [string]$BorderHex,
    [int]$ShadowAlpha = 28
  )

  foreach ($offset in @(20, 12, 6)) {
    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($ShadowAlpha, 0, 0, 0))
    try {
      Draw-RoundedRect -Graphics $Graphics -Brush $shadowBrush -Pen $null -X $X -Y ($Y + $offset) -Width $Width -Height $Height -Radius $Radius
    } finally {
      $shadowBrush.Dispose()
    }
  }

  $fillBrush = New-Object System.Drawing.SolidBrush (New-Color $FillHex)
  $borderPen = New-Object System.Drawing.Pen (New-Color $BorderHex)
  $borderPen.Width = 2
  try {
    Draw-RoundedRect -Graphics $Graphics -Brush $fillBrush -Pen $borderPen -X $X -Y $Y -Width $Width -Height $Height -Radius $Radius
  } finally {
    $fillBrush.Dispose()
    $borderPen.Dispose()
  }
}

function Draw-TextBlock {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Text,
    [System.Drawing.Font]$Font,
    [System.Drawing.Brush]$Brush,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [string]$Alignment = 'Near',
    [string]$LineAlignment = 'Near'
  )

  $format = New-Object System.Drawing.StringFormat
  switch ($Alignment) {
    'Center' { $format.Alignment = [System.Drawing.StringAlignment]::Center }
    'Far' { $format.Alignment = [System.Drawing.StringAlignment]::Far }
    default { $format.Alignment = [System.Drawing.StringAlignment]::Near }
  }
  switch ($LineAlignment) {
    'Center' { $format.LineAlignment = [System.Drawing.StringAlignment]::Center }
    'Far' { $format.LineAlignment = [System.Drawing.StringAlignment]::Far }
    default { $format.LineAlignment = [System.Drawing.StringAlignment]::Near }
  }

  try {
    $rect = [System.Drawing.RectangleF]::new($X, $Y, $Width, $Height)
    $Graphics.DrawString($Text, $Font, $Brush, $rect, $format)
  } finally {
    $format.Dispose()
  }
}

function Draw-FitImage {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Image]$Image,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-RoundedRectPath -X $X -Y $Y -Width $Width -Height $Height -Radius $Radius
  $previousClip = $Graphics.Clip
  try {
    $Graphics.SetClip($path)
    $scale = [Math]::Min($Width / $Image.Width, $Height / $Image.Height)
    $drawWidth = $Image.Width * $scale
    $drawHeight = $Image.Height * $scale
    $drawX = $X + (($Width - $drawWidth) / 2)
    $drawY = $Y + (($Height - $drawHeight) / 2)
    $Graphics.DrawImage($Image, [System.Drawing.RectangleF]::new($drawX, $drawY, $drawWidth, $drawHeight))
  } finally {
    $Graphics.Clip = $previousClip
    $path.Dispose()
  }
}

function Draw-RotatedScreenshotCard {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Image]$Image,
    [float]$CenterX,
    [float]$CenterY,
    [float]$Width,
    [float]$Height,
    [float]$Angle,
    [float]$Radius,
    [string]$FrameFill = '#101827',
    [string]$FrameBorder = '#2a3548'
  )

  $state = $Graphics.Save()
  try {
    $Graphics.TranslateTransform($CenterX, $CenterY)
    $Graphics.RotateTransform($Angle)
    Draw-ShadowedPanel -Graphics $Graphics -X (-$Width / 2) -Y (-$Height / 2) -Width $Width -Height $Height -Radius $Radius -FillHex $FrameFill -BorderHex $FrameBorder -ShadowAlpha 20
    Draw-FitImage -Graphics $Graphics -Image $Image -X ((-$Width / 2) + 18) -Y ((-$Height / 2) + 18) -Width ($Width - 36) -Height ($Height - 36) -Radius ($Radius - 8)
  } finally {
    $Graphics.Restore($state)
  }
}

function Draw-Pill {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [string]$FillHex,
    [string]$BorderHex
  )

  $fillBrush = New-Object System.Drawing.SolidBrush (New-Color $FillHex)
  $borderPen = New-Object System.Drawing.Pen (New-Color $BorderHex)
  $borderPen.Width = 2
  try {
    Draw-RoundedRect -Graphics $Graphics -Brush $fillBrush -Pen $borderPen -X $X -Y $Y -Width $Width -Height $Height -Radius ($Height / 2)
  } finally {
    $fillBrush.Dispose()
    $borderPen.Dispose()
  }
}

function Draw-SpeechBubble {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$TailX,
    [float]$TailY,
    [string]$FillHex = '#ffffff',
    [string]$BorderHex = '#111827'
  )

  $fillBrush = New-Object System.Drawing.SolidBrush (New-Color $FillHex)
  $borderPen = New-Object System.Drawing.Pen (New-Color $BorderHex)
  $borderPen.Width = 4
  try {
    Draw-RoundedRect -Graphics $Graphics -Brush $fillBrush -Pen $borderPen -X $X -Y $Y -Width $Width -Height $Height -Radius 26

    $tail = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tail.AddPolygon(@(
        [System.Drawing.PointF]::new($TailX, $TailY),
        [System.Drawing.PointF]::new($TailX + 34, $TailY - 8),
        [System.Drawing.PointF]::new($TailX + 18, $TailY - 42)
      ))
    try {
      $Graphics.FillPath($fillBrush, $tail)
      $Graphics.DrawPath($borderPen, $tail)
    } finally {
      $tail.Dispose()
    }
  } finally {
    $fillBrush.Dispose()
    $borderPen.Dispose()
  }
}

function Draw-HalftoneDots {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$StartX,
    [int]$StartY,
    [int]$EndX,
    [int]$EndY,
    [int]$Gap,
    [System.Drawing.Color]$Color
  )

  $brush = New-Object System.Drawing.SolidBrush $Color
  try {
    for ($x = $StartX; $x -le $EndX; $x += $Gap) {
      for ($y = $StartY; $y -le $EndY; $y += $Gap) {
        $Graphics.FillEllipse($brush, $x, $y, 6, 6)
      }
    }
  } finally {
    $brush.Dispose()
  }
}

function Draw-SimpleTeacher {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Scale = 1
  )

  $outline = New-Object System.Drawing.Pen (New-Color '#111827')
  $outline.Width = 5 * $Scale
  $skinBrush = New-Object System.Drawing.SolidBrush (New-Color '#fde0c8')
  $hairBrush = New-Object System.Drawing.SolidBrush (New-Color '#1f2937')
  $coatBrush = New-Object System.Drawing.SolidBrush (New-Color '#3b82f6')
  $shirtBrush = New-Object System.Drawing.SolidBrush (New-Color '#ffffff')

  try {
    $Graphics.FillEllipse($skinBrush, $X + (40 * $Scale), $Y, 110 * $Scale, 120 * $Scale)
    $Graphics.DrawEllipse($outline, $X + (40 * $Scale), $Y, 110 * $Scale, 120 * $Scale)

    $Graphics.FillPie($hairBrush, $X + (28 * $Scale), $Y - (12 * $Scale), 130 * $Scale, 92 * $Scale, 180, 180)
    $Graphics.DrawArc($outline, $X + (28 * $Scale), $Y - (12 * $Scale), 130 * $Scale, 92 * $Scale, 180, 180)

    $glassesPen = New-Object System.Drawing.Pen (New-Color '#111827')
    $glassesPen.Width = 4 * $Scale
    try {
      $Graphics.DrawEllipse($glassesPen, $X + (58 * $Scale), $Y + (44 * $Scale), 28 * $Scale, 22 * $Scale)
      $Graphics.DrawEllipse($glassesPen, $X + (98 * $Scale), $Y + (44 * $Scale), 28 * $Scale, 22 * $Scale)
      $Graphics.DrawLine($glassesPen, $X + (86 * $Scale), $Y + (55 * $Scale), $X + (98 * $Scale), $Y + (55 * $Scale))
    } finally {
      $glassesPen.Dispose()
    }

    $Graphics.DrawArc($outline, $X + (82 * $Scale), $Y + (58 * $Scale), 16 * $Scale, 18 * $Scale, 0, 180)
    $Graphics.DrawArc($outline, $X + (82 * $Scale), $Y + (78 * $Scale), 22 * $Scale, 14 * $Scale, 20, 140)

    $Graphics.FillEllipse($coatBrush, $X + (22 * $Scale), $Y + (110 * $Scale), 150 * $Scale, 130 * $Scale)
    $Graphics.DrawEllipse($outline, $X + (22 * $Scale), $Y + (110 * $Scale), 150 * $Scale, 130 * $Scale)
    $Graphics.FillRectangle($shirtBrush, $X + (78 * $Scale), $Y + (118 * $Scale), 42 * $Scale, 54 * $Scale)
    $Graphics.DrawRectangle($outline, $X + (78 * $Scale), $Y + (118 * $Scale), 42 * $Scale, 54 * $Scale)

    $Graphics.DrawLine($outline, $X + (12 * $Scale), $Y + (154 * $Scale), $X - (28 * $Scale), $Y + (126 * $Scale))
    $Graphics.DrawLine($outline, $X + (184 * $Scale), $Y + (154 * $Scale), $X + (220 * $Scale), $Y + (118 * $Scale))
    $Graphics.DrawLine($outline, $X + (70 * $Scale), $Y + (238 * $Scale), $X + (54 * $Scale), $Y + (286 * $Scale))
    $Graphics.DrawLine($outline, $X + (124 * $Scale), $Y + (238 * $Scale), $X + (140 * $Scale), $Y + (286 * $Scale))
  } finally {
    $outline.Dispose()
    $skinBrush.Dispose()
    $hairBrush.Dispose()
    $coatBrush.Dispose()
    $shirtBrush.Dispose()
  }
}

function Draw-Tape {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$CenterX,
    [float]$CenterY,
    [float]$Width,
    [float]$Height,
    [float]$Angle,
    [string]$FillHex
  )

  $state = $Graphics.Save()
  try {
    $Graphics.TranslateTransform($CenterX, $CenterY)
    $Graphics.RotateTransform($Angle)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, (New-Color $FillHex).R, (New-Color $FillHex).G, (New-Color $FillHex).B))
    try {
      Draw-RoundedRect -Graphics $Graphics -Brush $brush -Pen $null -X (-$Width / 2) -Y (-$Height / 2) -Width $Width -Height $Height -Radius 10
    } finally {
      $brush.Dispose()
    }
  } finally {
    $Graphics.Restore($state)
  }
}

function Draw-NotebookLines {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$Width,
    [int]$Height
  )

  $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(32, 100, 116, 139))
  $linePen.Width = 2
  try {
    for ($y = 130; $y -lt $Height; $y += 54) {
      $Graphics.DrawLine($linePen, 58, $y, $Width - 58, $y)
    }
  } finally {
    $linePen.Dispose()
  }
}

function Create-Canvas {
  param([int]$Width, [int]$Height)
  $bmp = New-Object System.Drawing.Bitmap $Width, $Height
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  return @{ Bitmap = $bmp; Graphics = $graphics }
}

$root = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $root 'promo-styles-output'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$icon = [System.Drawing.Image]::FromFile((Join-Path $root 'build/icon.png'))
$dashboard = [System.Drawing.Image]::FromFile((Join-Path $root 'docs/screenshots/dashboard.png'))
$timetable = [System.Drawing.Image]::FromFile((Join-Path $root 'docs/screenshots/timetable.png'))
$seating = [System.Drawing.Image]::FromFile((Join-Path $root 'docs/screenshots/seating.png'))
$schedule = [System.Drawing.Image]::FromFile((Join-Path $root 'docs/screenshots/schedule.png'))
$memo = [System.Drawing.Image]::FromFile((Join-Path $root 'docs/screenshots/memo.png'))
$homeroom = [System.Drawing.Image]::FromFile((Join-Path $root 'docs/screenshots/homeroom.png'))

try {
  $white = New-Object System.Drawing.SolidBrush (New-Color '#f8fafc')
  $muted = New-Object System.Drawing.SolidBrush (New-Color '#cbd5e1')
  $slate = New-Object System.Drawing.SolidBrush (New-Color '#64748b')
  $ink = New-Object System.Drawing.SolidBrush (New-Color '#0f172a')
  $blue = New-Object System.Drawing.SolidBrush (New-Color '#2563eb')
  $amber = New-Object System.Drawing.SolidBrush (New-Color '#f59e0b')
  $green = New-Object System.Drawing.SolidBrush (New-Color '#10b981')
  $paper = New-Object System.Drawing.SolidBrush (New-Color '#fffaf0')

  $titleBig = New-Object System.Drawing.Font('Malgun Gothic', 66, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $titleMid = New-Object System.Drawing.Font('Malgun Gothic', 54, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $titleWebtoon = New-Object System.Drawing.Font('Malgun Gothic', 48, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $speechFont = New-Object System.Drawing.Font('Malgun Gothic', 38, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $diaryTitle = New-Object System.Drawing.Font('Malgun Gothic', 46, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subtitle = New-Object System.Drawing.Font('Malgun Gothic', 28, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $body = New-Object System.Drawing.Font('Malgun Gothic', 24, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $bodyBold = New-Object System.Drawing.Font('Malgun Gothic', 24, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $small = New-Object System.Drawing.Font('Malgun Gothic', 18, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $smallBold = New-Object System.Drawing.Font('Malgun Gothic', 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $tiny = New-Object System.Drawing.Font('Malgun Gothic', 14, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

  try {
    # Movie poster 1
    $canvas = Create-Canvas -Width 1080 -Height 1350
    $g = $canvas.Graphics
    try {
      $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
        [System.Drawing.Point]::new(0, 0),
        [System.Drawing.Point]::new(1080, 1350),
        (New-Color '#090d17'),
        (New-Color '#162033')
      )
      try { $g.FillRectangle($bgBrush, 0, 0, 1080, 1350) } finally { $bgBrush.Dispose() }

      $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
      $glow.AddEllipse(620, 70, 500, 360)
      $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
      $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(90, 245, 158, 11)
      $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 245, 158, 11))
      try { $g.FillEllipse($glowBrush, 620, 70, 500, 360) } finally { $glowBrush.Dispose(); $glow.Dispose() }

      Draw-HalftoneDots -Graphics $g -StartX 60 -StartY 1030 -EndX 320 -EndY 1270 -Gap 28 -Color ([System.Drawing.Color]::FromArgb(34, 148, 163, 184))
      Draw-Pill -Graphics $g -X 64 -Y 60 -Width 184 -Height 48 -FillHex '#1d2840' -BorderHex '#3b82f6'
      Draw-TextBlock -Graphics $g -Text (U '\uc601\ud654\u0020\ud3ec\uc2a4\ud130\u0020\uc2dc\uc548') -Font $smallBold -Brush $white -X 88 -Y 73 -Width 140 -Height 22

      $g.DrawImage($icon, [System.Drawing.RectangleF]::new(900, 62, 34, 34))
      Draw-TextBlock -Graphics $g -Text (U '\uc324\ud540') -Font $smallBold -Brush $white -X 946 -Y 66 -Width 60 -Height 20

      Draw-TextBlock -Graphics $g -Text (U '\uad50\ubb34\uc2e4\uc758\u0020\uc0c8\ubcbd') -Font $titleBig -Brush $white -X 62 -Y 152 -Width 720 -Height 80
      Draw-TextBlock -Graphics $g -Text (U '\uc218\uc5c5\u0020\uc804\u0020\u0031\u0030\ubd84\u002c\u0020\ud558\ub8e8\uac00\u0020\uc815\ub9ac\ub41c\ub2e4') -Font $subtitle -Brush $muted -X 66 -Y 246 -Width 580 -Height 40
      Draw-TextBlock -Graphics $g -Text (U '\uc2dc\uac04\ud45c\u00b7\uc77c\uc815\u00b7\ud560\u0020\uc77c\u00b7\uba54\ubaa8') -Font $bodyBold -Brush $amber -X 66 -Y 304 -Width 420 -Height 32

      Draw-RotatedScreenshotCard -Graphics $g -Image $dashboard -CenterX 560 -CenterY 820 -Width 900 -Height 560 -Angle -2.5 -Radius 34

      $creditPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(36, 148, 163, 184))
      try { $g.DrawLine($creditPen, 60, 1190, 1020, 1190) } finally { $creditPen.Dispose() }
      Draw-TextBlock -Graphics $g -Text (U '\uc624\ub298\uc758\u0020\uc218\uc5c5\u0020\uc2dc\uc791\u0020\uc804\u002c\u0020\uc4f0\ub294\u0020\uc0ac\ub78c\uc744\u0020\uc704\ud55c\u0020\ub370\uc2a4\ud06c\ud1b1\u0020\ub300\uc2dc\ubcf4\ub4dc') -Font $small -Brush $muted -X 64 -Y 1212 -Width 720 -Height 24
      Draw-TextBlock -Graphics $g -Text (U '\uc2e4\uc81c\u0020\uc30d\ud540\u0020\uc0ac\uc6a9\u0020\ud654\uba74\u0020\uae30\ubc18') -Font $tiny -Brush $slate -X 64 -Y 1246 -Width 220 -Height 20
      Draw-TextBlock -Graphics $g -Text '01' -Font $titleMid -Brush $white -X 930 -Y 1204 -Width 90 -Height 60 -Alignment 'Center'
    } finally {
      $g.Dispose()
      $canvas.Bitmap.Save((Join-Path $outputDir '01-movie-poster-dawn.png'), [System.Drawing.Imaging.ImageFormat]::Png)
      $canvas.Bitmap.Dispose()
    }

    # Movie poster 2
    $canvas = Create-Canvas -Width 1080 -Height 1350
    $g = $canvas.Graphics
    try {
      $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
        [System.Drawing.Point]::new(0, 0),
        [System.Drawing.Point]::new(0, 1350),
        (New-Color '#0b0f19'),
        (New-Color '#1b2030')
      )
      try { $g.FillRectangle($bgBrush, 0, 0, 1080, 1350) } finally { $bgBrush.Dispose() }

      $redGlow = New-Object System.Drawing.Drawing2D.GraphicsPath
      $redGlow.AddEllipse(-120, 130, 520, 420)
      $redBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $redGlow
      $redBrush.CenterColor = [System.Drawing.Color]::FromArgb(90, 239, 68, 68)
      $redBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 239, 68, 68))
      try { $g.FillEllipse($redBrush, -120, 130, 520, 420) } finally { $redBrush.Dispose(); $redGlow.Dispose() }

      $blueGlow = New-Object System.Drawing.Drawing2D.GraphicsPath
      $blueGlow.AddEllipse(720, 740, 420, 360)
      $blueBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $blueGlow
      $blueBrush.CenterColor = [System.Drawing.Color]::FromArgb(100, 59, 130, 246)
      $blueBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 59, 130, 246))
      try { $g.FillEllipse($blueBrush, 720, 740, 420, 360) } finally { $blueBrush.Dispose(); $blueGlow.Dispose() }

      Draw-Pill -Graphics $g -X 64 -Y 60 -Width 198 -Height 48 -FillHex '#2b1620' -BorderHex '#ef4444'
      Draw-TextBlock -Graphics $g -Text (U '\uadf9\uc7a5\ud615\u0020\ud3ec\uc2a4\ud130') -Font $smallBold -Brush $white -X 92 -Y 73 -Width 146 -Height 22
      Draw-TextBlock -Graphics $g -Text (U '\ub2f4\uc784\uc758\u0020\ud558\ub8e8') -Font $titleBig -Brush $white -X 64 -Y 152 -Width 620 -Height 82
      Draw-TextBlock -Graphics $g -Text (U '\uae30\ub85d\u002c\u0020\uc0c1\ub2f4\u002c\u0020\uc790\ub9ac\ubc30\uce58\u002e\u0020\ubc14\uc05c\u0020\ud559\uae09\uc744\u0020\ud55c\u0020\uacf3\uc5d0') -Font $subtitle -Brush $muted -X 68 -Y 246 -Width 660 -Height 44

      Draw-RotatedScreenshotCard -Graphics $g -Image $homeroom -CenterX 540 -CenterY 760 -Width 840 -Height 500 -Angle -1.5 -Radius 36
      Draw-RotatedScreenshotCard -Graphics $g -Image $seating -CenterX 804 -CenterY 972 -Width 390 -Height 286 -Angle 6 -Radius 28 -FrameFill '#131a2b'

      Draw-TextBlock -Graphics $g -Text (U '\uae30\ub85d\uacfc\u0020\uc0c1\ub2f4\u0020\uc774\ub825\uae4c\uc9c0') -Font $bodyBold -Brush $white -X 66 -Y 1080 -Width 320 -Height 28
      Draw-TextBlock -Graphics $g -Text (U '\ud559\uc0dd\u0020\uc774\ub984\uacfc\u0020\uc0c1\ud0dc\ub97c\u0020\uc2dc\uc120\uc774\u0020\uc5c7\uae30\u0020\uc804\uc5d0\u0020\uc815\ub9ac\ud574\uc90d\ub2c8\ub2e4') -Font $body -Brush $muted -X 66 -Y 1118 -Width 500 -Height 60
      Draw-TextBlock -Graphics $g -Text (U '\ucf54\uc2a4\ud130\u0020\uc2dc\uc548\u0020\u0030\u0032') -Font $small -Brush $slate -X 66 -Y 1216 -Width 150 -Height 20
      Draw-TextBlock -Graphics $g -Text '02' -Font $titleMid -Brush $white -X 914 -Y 1186 -Width 100 -Height 60 -Alignment 'Center'
    } finally {
      $g.Dispose()
      $canvas.Bitmap.Save((Join-Path $outputDir '02-movie-poster-homeroom.png'), [System.Drawing.Imaging.ImageFormat]::Png)
      $canvas.Bitmap.Dispose()
    }

    # Webtoon
    $canvas = Create-Canvas -Width 1080 -Height 1920
    $g = $canvas.Graphics
    try {
      $paperBrush2 = New-Object System.Drawing.SolidBrush (New-Color '#f8fafc')
      try { $g.FillRectangle($paperBrush2, 0, 0, 1080, 1920) } finally { $paperBrush2.Dispose() }

      $panelPen = New-Object System.Drawing.Pen (New-Color '#0f172a')
      $panelPen.Width = 8
      try {
        foreach ($rect in @(
            @{ X = 40; Y = 40; W = 1000; H = 560 },
            @{ X = 40; Y = 680; W = 1000; H = 560 },
            @{ X = 40; Y = 1320; W = 1000; H = 560 }
          )) {
          $fill = New-Object System.Drawing.SolidBrush (New-Color '#ffffff')
          try {
            Draw-RoundedRect -Graphics $g -Brush $fill -Pen $panelPen -X $rect.X -Y $rect.Y -Width $rect.W -Height $rect.H -Radius 34
          } finally {
            $fill.Dispose()
          }
        }
      } finally {
        $panelPen.Dispose()
      }

      Draw-HalftoneDots -Graphics $g -StartX 78 -StartY 88 -EndX 396 -EndY 520 -Gap 22 -Color ([System.Drawing.Color]::FromArgb(28, 37, 99, 235))
      Draw-SimpleTeacher -Graphics $g -X 120 -Y 182 -Scale 1.25
      Draw-SpeechBubble -Graphics $g -X 390 -Y 102 -Width 510 -Height 136 -TailX 520 -TailY 258
      Draw-TextBlock -Graphics $g -Text (U '\uc5b4\ub514\u0020\uc801\uc5b4\ub1a8\ub354\ub77c\u002e\u002e\u002e') -Font $speechFont -Brush $ink -X 430 -Y 146 -Width 430 -Height 48
      Draw-TextBlock -Graphics $g -Text (U '\uba54\ubaa8\ub3c4\u0020\uc77c\uc815\ub3c4\u0020\uc5ec\uae30\uc800\uae30') -Font $body -Brush $slate -X 450 -Y 276 -Width 420 -Height 34

      $noteBrush = New-Object System.Drawing.SolidBrush (New-Color '#fde68a')
      $pinkBrush = New-Object System.Drawing.SolidBrush (New-Color '#fbcfe8')
      try {
        Draw-RoundedRect -Graphics $g -Brush $noteBrush -Pen $null -X 720 -Y 340 -Width 170 -Height 120 -Radius 14
        Draw-RoundedRect -Graphics $g -Brush $pinkBrush -Pen $null -X 860 -Y 410 -Width 120 -Height 90 -Radius 14
      } finally {
        $noteBrush.Dispose()
        $pinkBrush.Dispose()
      }
      Draw-TextBlock -Graphics $g -Text (U '\uc0c1\ub2f4') -Font $bodyBold -Brush $ink -X 772 -Y 380 -Width 70 -Height 28 -Alignment 'Center'
      Draw-TextBlock -Graphics $g -Text (U '\ud68c\uc758') -Font $smallBold -Brush $ink -X 894 -Y 440 -Width 52 -Height 24 -Alignment 'Center'
      Draw-TextBlock -Graphics $g -Text (U '\u0031\ud654') -Font $smallBold -Brush $ink -X 50 -Y 556 -Width 50 -Height 24

      Draw-HalftoneDots -Graphics $g -StartX 680 -StartY 734 -EndX 980 -EndY 1160 -Gap 22 -Color ([System.Drawing.Color]::FromArgb(30, 245, 158, 11))
      Draw-SimpleTeacher -Graphics $g -X 96 -Y 848 -Scale 1.15
      Draw-SpeechBubble -Graphics $g -X 304 -Y 738 -Width 474 -Height 122 -TailX 430 -TailY 890
      Draw-TextBlock -Graphics $g -Text (U '\uc30d\ud540\uc5d0\u0020\ub2e4\u0020\ubaa8\uc544\u0021') -Font $speechFont -Brush $ink -X 338 -Y 782 -Width 406 -Height 42
      Draw-TextBlock -Graphics $g -Text (U '\uc815\ub9ac') -Font $titleBig -Brush $blue -X 764 -Y 720 -Width 220 -Height 72 -Alignment 'Center'
      Draw-RotatedScreenshotCard -Graphics $g -Image $schedule -CenterX 604 -CenterY 1026 -Width 496 -Height 272 -Angle -4 -Radius 24
      Draw-RotatedScreenshotCard -Graphics $g -Image $memo -CenterX 816 -CenterY 1144 -Width 296 -Height 220 -Angle 5 -Radius 22 -FrameFill '#fff7ed' -FrameBorder '#fdba74'
      Draw-TextBlock -Graphics $g -Text (U '\u0032\ud654') -Font $smallBold -Brush $ink -X 50 -Y 1196 -Width 50 -Height 24

      $burstPen = New-Object System.Drawing.Pen (New-Color '#111827')
      $burstPen.Width = 4
      try {
        for ($i = 0; $i -lt 12; $i++) {
          $angle = $i * 30
          $state = $g.Save()
          try {
            $g.TranslateTransform(540, 1600)
            $g.RotateTransform($angle)
            $g.DrawLine($burstPen, 0, -280, 0, -360)
          } finally {
            $g.Restore($state)
          }
        }
      } finally {
        $burstPen.Dispose()
      }

      Draw-SimpleTeacher -Graphics $g -X 64 -Y 1470 -Scale 1.2
      Draw-RotatedScreenshotCard -Graphics $g -Image $dashboard -CenterX 682 -CenterY 1600 -Width 620 -Height 360 -Angle -1.5 -Radius 28
      Draw-SpeechBubble -Graphics $g -X 94 -Y 1340 -Width 410 -Height 122 -TailX 232 -TailY 1474
      Draw-TextBlock -Graphics $g -Text (U '\uc774\uc81c\u0020\ud55c\u0020\ud654\uba74\u0021') -Font $speechFont -Brush $ink -X 126 -Y 1384 -Width 344 -Height 42
      Draw-TextBlock -Graphics $g -Text (U '\u0033\ud654') -Font $smallBold -Brush $ink -X 50 -Y 1832 -Width 50 -Height 24
    } finally {
      $g.Dispose()
      $canvas.Bitmap.Save((Join-Path $outputDir '03-webtoon-3cut.png'), [System.Drawing.Imaging.ImageFormat]::Png)
      $canvas.Bitmap.Dispose()
    }

    # Diary memo
    $canvas = Create-Canvas -Width 1080 -Height 1350
    $g = $canvas.Graphics
    try {
      $paperBg = New-Object System.Drawing.SolidBrush (New-Color '#fffaf0')
      try { $g.FillRectangle($paperBg, 0, 0, 1080, 1350) } finally { $paperBg.Dispose() }
      Draw-NotebookLines -Graphics $g -Width 1080 -Height 1350
      $marginPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 251, 191, 36))
      $marginPen.Width = 4
      try { $g.DrawLine($marginPen, 132, 48, 132, 1290) } finally { $marginPen.Dispose() }

      Draw-TextBlock -Graphics $g -Text (U '\u0034\uc6d4\u0020\u0032\u0031\uc77c\u0020\uc6d4\uc694\uc77c') -Font $smallBold -Brush $ink -X 176 -Y 70 -Width 260 -Height 24
      Draw-TextBlock -Graphics $g -Text (U '\uc624\ub298\ub3c4\u0020\uba54\ubaa8\uac00\u0020\ud55c\uac00\ub4dd') -Font $diaryTitle -Brush $ink -X 174 -Y 122 -Width 760 -Height 56
      Draw-TextBlock -Graphics $g -Text (U '\uc0dd\uac01\ub098\ub294\u0020\uc21c\uac04\u0020\ubc14\ub85c\u0020\uc801\uc5b4\ub461\ub294\u0020\ud558\ub8e8') -Font $body -Brush $slate -X 176 -Y 194 -Width 440 -Height 32

      $sunBrush = New-Object System.Drawing.SolidBrush (New-Color '#fbbf24')
      try { $g.FillEllipse($sunBrush, 846, 82, 72, 72) } finally { $sunBrush.Dispose() }
      $rayPen = New-Object System.Drawing.Pen (New-Color '#f59e0b')
      $rayPen.Width = 4
      try {
        for ($i = 0; $i -lt 8; $i++) {
          $angle = $i * 45
          $state = $g.Save()
          try {
            $g.TranslateTransform(882, 118)
            $g.RotateTransform($angle)
            $g.DrawLine($rayPen, 0, -56, 0, -82)
          } finally {
            $g.Restore($state)
          }
        }
      } finally { $rayPen.Dispose() }

      Draw-ShadowedPanel -Graphics $g -X 170 -Y 292 -Width 742 -Height 612 -Radius 18 -FillHex '#ffffff' -BorderHex '#eadfcb' -ShadowAlpha 18
      Draw-FitImage -Graphics $g -Image $memo -X 194 -Y 316 -Width 694 -Height 564 -Radius 12
      Draw-Tape -Graphics $g -CenterX 254 -CenterY 292 -Width 124 -Height 34 -Angle -12 -FillHex '#fde68a'
      Draw-Tape -Graphics $g -CenterX 832 -CenterY 290 -Width 124 -Height 34 -Angle 10 -FillHex '#fbcfe8'

      Draw-TextBlock -Graphics $g -Text (U '\u2605\u0020\ud3ec\uc2a4\ud2b8\uc787\ucc98\ub7fc\u0020\uae30\ub85d') -Font $bodyBold -Brush $blue -X 176 -Y 944 -Width 260 -Height 28
      Draw-TextBlock -Graphics $g -Text (U '\u25cf\u0020\ud544\uc694\ud55c\u0020\uba54\ubaa8\ub9cc\u0020\ubaa8\uc544\ubcf4\uae30') -Font $body -Brush $ink -X 176 -Y 1008 -Width 360 -Height 28
      Draw-TextBlock -Graphics $g -Text (U '\u25cf\u0020\uc0c9\uc0c1\uc73c\ub85c\u0020\ube60\ub974\uac8c\u0020\uad6c\ubd84\ud558\uae30') -Font $body -Brush $ink -X 176 -Y 1052 -Width 360 -Height 28
      Draw-TextBlock -Graphics $g -Text (U '\u25cf\u0020\uc0dd\uac01\ub0a0\u0020\ub54c\u0020\ubc14\ub85c\u0020\uc791\uc131') -Font $body -Brush $ink -X 176 -Y 1096 -Width 360 -Height 28
      Draw-TextBlock -Graphics $g -Text (U '\u2661\u0020\ud558\ub8e8\uac00\u0020\ub354\u0020\uac00\ubcbc\uc6cc\uc9c4\ub2e4') -Font $bodyBold -Brush $green -X 176 -Y 1160 -Width 280 -Height 28
    } finally {
      $g.Dispose()
      $canvas.Bitmap.Save((Join-Path $outputDir '04-picture-diary-memo.png'), [System.Drawing.Imaging.ImageFormat]::Png)
      $canvas.Bitmap.Dispose()
    }

    # Diary schedule
    $canvas = Create-Canvas -Width 1080 -Height 1350
    $g = $canvas.Graphics
    try {
      $paperBg = New-Object System.Drawing.SolidBrush (New-Color '#fffaf0')
      try { $g.FillRectangle($paperBg, 0, 0, 1080, 1350) } finally { $paperBg.Dispose() }
      Draw-NotebookLines -Graphics $g -Width 1080 -Height 1350

      Draw-TextBlock -Graphics $g -Text (U '\u0034\uc6d4\u0020\u0032\u0031\uc77c\u0020\uc758\u0020\uacc4\ud68d') -Font $smallBold -Brush $ink -X 94 -Y 72 -Width 260 -Height 24
      Draw-TextBlock -Graphics $g -Text (U '\uc774\ubc88\u0020\uc8fc\ub294\u0020\uc77c\uc815\uc774\u0020\ub9ce\ub2e4') -Font $titleMid -Brush $ink -X 92 -Y 118 -Width 460 -Height 60
      Draw-TextBlock -Graphics $g -Text (U '\ub2ec\ub825\uacfc\u0020\uc608\uc815\uc744\u0020\ud568\uaed8\u0020\ubcf4\uba74\u0020\ub35c\u0020\ubc14\uc05c\uac83\u0020\uac19\ub2e4') -Font $body -Brush $slate -X 94 -Y 194 -Width 560 -Height 32

      Draw-ShadowedPanel -Graphics $g -X 92 -Y 282 -Width 644 -Height 520 -Radius 20 -FillHex '#ffffff' -BorderHex '#eadfcb' -ShadowAlpha 18
      Draw-FitImage -Graphics $g -Image $schedule -X 116 -Y 306 -Width 596 -Height 472 -Radius 12
      Draw-Tape -Graphics $g -CenterX 164 -CenterY 280 -Width 116 -Height 32 -Angle -11 -FillHex '#bfdbfe'
      Draw-Tape -Graphics $g -CenterX 676 -CenterY 284 -Width 116 -Height 32 -Angle 9 -FillHex '#fde68a'

      Draw-ShadowedPanel -Graphics $g -X 760 -Y 282 -Width 246 -Height 360 -Radius 22 -FillHex '#fff8dc' -BorderHex '#fcd34d' -ShadowAlpha 14
      Draw-TextBlock -Graphics $g -Text (U '\uccb4\ud06c') -Font $bodyBold -Brush $ink -X 826 -Y 316 -Width 110 -Height 28 -Alignment 'Center'
      Draw-TextBlock -Graphics $g -Text (U '\u2610\u0020\ud559\ubd80\ubaa8\u0020\uc0c1\ub2f4') -Font $body -Brush $ink -X 786 -Y 380 -Width 194 -Height 28
      Draw-TextBlock -Graphics $g -Text (U '\u2611\u0020\ud68c\uc758\u0020\uc790\ub8cc') -Font $body -Brush $ink -X 786 -Y 428 -Width 194 -Height 28
      Draw-TextBlock -Graphics $g -Text (U '\u2610\u0020\ubc30\ubd80\ud130\u0020\uc548\ub0b4') -Font $body -Brush $ink -X 786 -Y 476 -Width 194 -Height 28
      Draw-TextBlock -Graphics $g -Text (U '\u2610\u0020\uc8fc\uac04\u0020\uacc4\ud68d') -Font $body -Brush $ink -X 786 -Y 524 -Width 194 -Height 28

      Draw-TextBlock -Graphics $g -Text (U '\u25a1\u0020\ub2ec\ub825\uc5d0\u0020\uc801\uc5b4\ub450\uba74') -Font $bodyBold -Brush $blue -X 94 -Y 870 -Width 260 -Height 28
      Draw-TextBlock -Graphics $g -Text (U '\uc0c1\ub2f4\u00b7\ud559\uc0ac\u00b7\ud589\uc815\u0020\uc77c\uc815\uc744\u0020\ud55c\ubc88\uc5d0\u0020\ubcf8\ub2e4') -Font $body -Brush $ink -X 94 -Y 924 -Width 480 -Height 32
      Draw-TextBlock -Graphics $g -Text (U '\u25a1\u0020\uc624\ub298\u0020\ud560\u0020\uc77c\uacfc\u0020\ud568\uaed8\u0020\uc5f0\uacb0\ud558\uae30') -Font $bodyBold -Brush $green -X 94 -Y 986 -Width 360 -Height 32
      Draw-TextBlock -Graphics $g -Text (U '\u25a1\u0020\uc2a4\ud06c\ub9b0\uc0f7\u0020\uae30\ubc18\u0020\uadf8\ub9bc\u0020\uc77c\uae30\u0020\uc2dc\uc548') -Font $small -Brush $slate -X 94 -Y 1118 -Width 320 -Height 24
    } finally {
      $g.Dispose()
      $canvas.Bitmap.Save((Join-Path $outputDir '05-picture-diary-schedule.png'), [System.Drawing.Imaging.ImageFormat]::Png)
      $canvas.Bitmap.Dispose()
    }
  } finally {
    $white.Dispose()
    $muted.Dispose()
    $slate.Dispose()
    $ink.Dispose()
    $blue.Dispose()
    $amber.Dispose()
    $green.Dispose()
    $paper.Dispose()
    $titleBig.Dispose()
    $titleMid.Dispose()
    $titleWebtoon.Dispose()
    $speechFont.Dispose()
    $diaryTitle.Dispose()
    $subtitle.Dispose()
    $body.Dispose()
    $bodyBold.Dispose()
    $small.Dispose()
    $smallBold.Dispose()
    $tiny.Dispose()
  }
} finally {
  $icon.Dispose()
  $dashboard.Dispose()
  $timetable.Dispose()
  $seating.Dispose()
  $schedule.Dispose()
  $memo.Dispose()
  $homeroom.Dispose()
}
