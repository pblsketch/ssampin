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
  if ($clean.Length -ne 6) {
    throw "Invalid color hex: $Hex"
  }

  $r = [Convert]::ToInt32($clean.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($clean.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($clean.Substring(4, 2), 16)

  return [System.Drawing.Color]::FromArgb($Alpha, $r, $g, $b)
}

function U {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Escaped
  )

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
    if ($Brush) {
      $Graphics.FillPath($Brush, $path)
    }
    if ($Pen) {
      $Graphics.DrawPath($Pen, $path)
    }
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
    [string]$BorderHex
  )

  foreach ($shadow in @(
      @{ Offset = 26; Alpha = 16 },
      @{ Offset = 18; Alpha = 24 },
      @{ Offset = 10; Alpha = 32 }
    )) {
    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($shadow.Alpha, 0, 0, 0))
    try {
      Draw-RoundedRect -Graphics $Graphics -Brush $shadowBrush -Pen $null -X $X -Y ($Y + $shadow.Offset) -Width $Width -Height $Height -Radius $Radius
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

function Draw-DotGrid {
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
        $Graphics.FillEllipse($brush, $x, $y, 4, 4)
      }
    }
  } finally {
    $brush.Dispose()
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
    [string]$Alignment = 'Near'
  )

  $format = New-Object System.Drawing.StringFormat
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  switch ($Alignment) {
    'Center' { $format.Alignment = [System.Drawing.StringAlignment]::Center }
    'Far' { $format.Alignment = [System.Drawing.StringAlignment]::Far }
    default { $format.Alignment = [System.Drawing.StringAlignment]::Near }
  }

  try {
    $rect = [System.Drawing.RectangleF]::new($X, $Y, $Width, $Height)
    $Graphics.DrawString($Text, $Font, $Brush, $rect, $format)
  } finally {
    $format.Dispose()
  }
}

$root = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $root 'promo-images-output'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$iconPath = Join-Path $root 'build/icon.png'
$icon = $null
if (Test-Path $iconPath) {
  $icon = [System.Drawing.Image]::FromFile($iconPath)
}

$cards = @(
  @{
    Number = '01'
    Filename = '01-dashboard-promo.png'
    Tag = U '\uad50\uc0ac\uc6a9\u0020\ub370\uc2a4\ud06c\ud1b1\u0020\uc571'
    Title = U '\uad50\uc0ac\uc758\u0020\ud558\ub8e8\ub97c\u0020\ud55c\u0020\ud654\uba74\uc5d0'
    Subtitle = U '\uc2dc\uac04\ud45c\u002c\u0020\uc77c\uc815\u002c\u0020\uba54\ubaa8\u002c\u0020\ud560\u0020\uc77c\uc744\u0020\ucc28\ubd84\ud558\uac8c\u0020\uc815\ub9ac\ud558\ub294\u0020\ub300\uc2dc\ubcf4\ub4dc'
    Footer = U '\uc2e4\uc81c\u0020\uc324\ud540\u0020\uc0ac\uc6a9\u0020\ud654\uba74'
    Screenshot = 'docs/screenshots/dashboard.png'
  },
  @{
    Number = '02'
    Filename = '02-timetable-promo.png'
    Tag = U '\ud575\uc2ec\u0020\uae30\ub2a5'
    Title = U '\uc9c0\uae08\u0020\uba87\u0020\uad50\uc2dc\uc778\uc9c0\u0020\ubc14\ub85c\u0020\ubcf4\uc774\uac8c'
    Subtitle = U '\uad50\uc0ac\u0020\uc2dc\uac04\ud45c\uc640\u0020\ud559\uae09\u0020\uc2dc\uac04\ud45c\ub97c\u0020\ud55c\ub208\uc5d0\u0020\ud655\uc778\ud558\ub294\u0020\uc8fc\uac04\u0020\ubcf4\ub4dc'
    Footer = U '\uc2dc\uac04\ud45c\u0020\ud654\uba74'
    Screenshot = 'docs/screenshots/timetable.png'
  },
  @{
    Number = '03'
    Filename = '03-seating-promo.png'
    Tag = U '\ub2f4\uc784\u0020\uc5c5\ubb34'
    Title = U '\uc790\ub9ac\u0020\ubc14\uafb8\uae30\ub3c4\u0020\ub354\u0020\ube60\ub974\uac8c'
    Subtitle = U '\ud559\uae09\u0020\uc790\ub9ac\ubc30\uce58\u002c\u0020\ube48\uc790\ub9ac\u0020\ud655\uc778\u002c\u0020\ud559\uc0dd\u0020\uc704\uce58\u0020\ud30c\uc545\uc744\u0020\ud55c\u0020\ud654\uba74\uc5d0\uc11c'
    Footer = U '\uc790\ub9ac\ubc30\uce58\u0020\ud654\uba74'
    Screenshot = 'docs/screenshots/seating.png'
  },
  @{
    Number = '04'
    Filename = '04-schedule-promo.png'
    Tag = U '\ud559\uc0ac\u0020\uc77c\uc815'
    Title = U '\ub2e4\uac00\uc624\ub294\u0020\uc77c\uc815\uc744\u0020\ub193\uce58\uc9c0\u0020\uc54a\uac8c'
    Subtitle = U '\uc6d4\uac04\u0020\ub2ec\ub825\uacfc\u0020\uc608\uc815\ub41c\u0020\uc5c5\ubb34\ub97c\u0020\ud568\uaed8\u0020\ubcf4\ub294\u0020\uc77c\uc815\u0020\uad00\ub9ac\u0020\ud654\uba74'
    Footer = U '\uc77c\uc815\u0020\uad00\ub9ac\u0020\ud654\uba74'
    Screenshot = 'docs/screenshots/schedule.png'
  },
  @{
    Number = '05'
    Filename = '05-memo-promo.png'
    Tag = U '\uac00\ubcbc\uc6b4\u0020\uae30\ub85d'
    Title = U '\uc0dd\uac01\ub098\ub294\u0020\uc21c\uac04\u0020\ubc14\ub85c\u0020\uba54\ubaa8'
    Subtitle = U '\ud3ec\uc2a4\ud2b8\uc787\ucc98\ub7fc\u0020\uac00\ubccd\uac8c\u0020\uc4f0\uace0\u002c\u0020\ub354\u0020\ub610\ub837\ud558\uac8c\u0020\ubaa8\uc544\ubcf4\ub294\u0020\uba54\ubaa8\u0020\ubcf4\ub4dc'
    Footer = U '\uba54\ubaa8\u0020\ud654\uba74'
    Screenshot = 'docs/screenshots/memo.png'
  },
  @{
    Number = '06'
    Filename = '06-homeroom-promo.png'
    Tag = U '\ud559\uc0dd\u0020\uae30\ub85d'
    Title = U '\ud559\uc0dd\u0020\uae30\ub85d\ub3c4\u0020\ud55c\u0020\uacf3\uc5d0\uc11c'
    Subtitle = U '\uc0c1\ub2f4\u002c\u0020\uad00\ucc30\u002c\u0020\uccb4\ud06c\ub9ac\uc2a4\ud2b8\ub97c\u0020\ucc28\uace1\ucc28\uace1\u0020\uc313\uc544\ub450\ub294\u0020\ub2f4\uc784\u0020\uc5c5\ubb34\u0020\ud654\uba74'
    Footer = U '\ub2f4\uc784\u0020\uae30\ub85d\u0020\ud654\uba74'
    Screenshot = 'docs/screenshots/homeroom.png'
  }
)

$width = 1080
$height = 1350

$bgTop = New-Color '#0a0e17'
$bgBottom = New-Color '#131a2b'
$panelFill = '#182234'
$panelBorder = '#2a3548'
$accentBlue = '#3b82f6'
$accentAmber = '#f59e0b'
$textPrimary = New-Color '#e2e8f0'
$textMuted = New-Color '#94a3b8'
$textSoft = New-Color '#cbd5e1'

foreach ($card in $cards) {
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
      [System.Drawing.Point]::new(0, 0),
      [System.Drawing.Point]::new($width, $height),
      $bgTop,
      $bgBottom
    )
    try {
      $graphics.FillRectangle($backgroundBrush, 0, 0, $width, $height)
    } finally {
      $backgroundBrush.Dispose()
    }

    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(730, 40, 360, 240)
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(65, 59, 130, 246)
    $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 59, 130, 246))
    try {
      $graphics.FillEllipse($glowBrush, 730, 40, 360, 240)
    } finally {
      $glowBrush.Dispose()
      $glowPath.Dispose()
    }

    $amberGlowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $amberGlowPath.AddEllipse(-120, 1030, 420, 260)
    $amberGlowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $amberGlowPath
    $amberGlowBrush.CenterColor = [System.Drawing.Color]::FromArgb(42, 245, 158, 11)
    $amberGlowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 245, 158, 11))
    try {
      $graphics.FillEllipse($amberGlowBrush, -120, 1030, 420, 260)
    } finally {
      $amberGlowBrush.Dispose()
      $amberGlowPath.Dispose()
    }

    Draw-DotGrid -Graphics $graphics -StartX 760 -StartY 950 -EndX 1020 -EndY 1260 -Gap 24 -Color ([System.Drawing.Color]::FromArgb(34, 148, 163, 184))

    $pillBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(34, 59, 130, 246))
    $pillPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(72, 96, 165, 250))
    $pillPen.Width = 2
    try {
      Draw-RoundedRect -Graphics $graphics -Brush $pillBrush -Pen $pillPen -X 56 -Y 54 -Width 234 -Height 54 -Radius 27
    } finally {
      $pillBrush.Dispose()
      $pillPen.Dispose()
    }

    $tagFont = New-Object System.Drawing.Font('Malgun Gothic', 16, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $titleFont = New-Object System.Drawing.Font('Malgun Gothic', 44, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $subtitleFont = New-Object System.Drawing.Font('Malgun Gothic', 24, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $brandFont = New-Object System.Drawing.Font('Malgun Gothic', 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $captionFont = New-Object System.Drawing.Font('Malgun Gothic', 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $smallFont = New-Object System.Drawing.Font('Malgun Gothic', 16, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $pageFont = New-Object System.Drawing.Font('Malgun Gothic', 16, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    $whiteBrush = New-Object System.Drawing.SolidBrush $textPrimary
    $mutedBrush = New-Object System.Drawing.SolidBrush $textMuted
    $softBrush = New-Object System.Drawing.SolidBrush $textSoft
    $blueBrush = New-Object System.Drawing.SolidBrush (New-Color $accentBlue)
    $amberBrush = New-Object System.Drawing.SolidBrush (New-Color $accentAmber)

    try {
      Draw-TextBlock -Graphics $graphics -Text $card.Tag -Font $tagFont -Brush $whiteBrush -X 78 -Y 68 -Width 190 -Height 28

      if ($icon) {
        $graphics.DrawImage($icon, [System.Drawing.RectangleF]::new(842, 56, 42, 42))
      }
      Draw-TextBlock -Graphics $graphics -Text (U '\uc324\ud540') -Font $brandFont -Brush $whiteBrush -X 896 -Y 58 -Width 84 -Height 22
      Draw-TextBlock -Graphics $graphics -Text 'Teacher''s Dashboard' -Font $smallFont -Brush $mutedBrush -X 896 -Y 82 -Width 150 -Height 20

      Draw-TextBlock -Graphics $graphics -Text $card.Title -Font $titleFont -Brush $whiteBrush -X 56 -Y 134 -Width 860 -Height 64
      Draw-TextBlock -Graphics $graphics -Text $card.Subtitle -Font $subtitleFont -Brush $softBrush -X 56 -Y 214 -Width 910 -Height 70

      $accentPen = New-Object System.Drawing.Pen (New-Color $accentAmber)
      $accentPen.Width = 6
      try {
        $graphics.DrawLine($accentPen, 58, 304, 136, 304)
      } finally {
        $accentPen.Dispose()
      }
      Draw-TextBlock -Graphics $graphics -Text (U '\uc2e4\uc81c\u0020\ucea1\ucc98\u0020\uae30\ubc18\u0020\ud64d\ubcf4\u0020\uc774\ubbf8\uc9c0') -Font $smallFont -Brush $mutedBrush -X 150 -Y 292 -Width 250 -Height 24

      Draw-ShadowedPanel -Graphics $graphics -X 48 -Y 346 -Width 984 -Height 702 -Radius 34 -FillHex $panelFill -BorderHex $panelBorder

      $screenshotPath = Join-Path $root $card.Screenshot
      $screenshot = [System.Drawing.Image]::FromFile($screenshotPath)
      try {
        Draw-FitImage -Graphics $graphics -Image $screenshot -X 74 -Y 372 -Width 932 -Height 650 -Radius 24
      } finally {
        $screenshot.Dispose()
      }

      $labelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 10, 14, 23))
      $labelPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(64, 148, 163, 184))
      $labelPen.Width = 1.5
      try {
        Draw-RoundedRect -Graphics $graphics -Brush $labelBrush -Pen $labelPen -X 78 -Y 384 -Width 156 -Height 40 -Radius 20
      } finally {
        $labelBrush.Dispose()
        $labelPen.Dispose()
      }

      $graphics.FillEllipse($amberBrush, 94, 398, 12, 12)
      Draw-TextBlock -Graphics $graphics -Text (U '\uc2e4\uc81c\u0020\uc0ac\uc6a9\u0020\ud654\uba74') -Font $smallFont -Brush $whiteBrush -X 116 -Y 394 -Width 104 -Height 20

      Draw-ShadowedPanel -Graphics $graphics -X 56 -Y 1090 -Width 968 -Height 176 -Radius 28 -FillHex '#141d2c' -BorderHex '#243247'
      Draw-TextBlock -Graphics $graphics -Text $card.Footer -Font $captionFont -Brush $whiteBrush -X 84 -Y 1130 -Width 360 -Height 26
      Draw-TextBlock -Graphics $graphics -Text (U '\ud55c\uad6d\u0020\uc911\u00b7\uace0\ub4f1\ud559\uad50\u0020\uad50\uc0ac\ub97c\u0020\uc704\ud55c\u0020\ucc28\ubd84\ud55c\u0020\ub370\uc2a4\ud06c\ud1b1\u0020\ub300\uc2dc\ubcf4\ub4dc') -Font $smallFont -Brush $mutedBrush -X 84 -Y 1166 -Width 540 -Height 24

      $pagePillBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(32, 148, 163, 184))
      try {
        Draw-RoundedRect -Graphics $graphics -Brush $pagePillBrush -Pen $null -X 900 -Y 1142 -Width 88 -Height 44 -Radius 22
      } finally {
        $pagePillBrush.Dispose()
      }
      Draw-TextBlock -Graphics $graphics -Text ($card.Number + ' / 06') -Font $pageFont -Brush $whiteBrush -X 900 -Y 1154 -Width 88 -Height 20 -Alignment 'Center'

      $graphics.FillEllipse($blueBrush, 816, 1210, 12, 12)
      Draw-TextBlock -Graphics $graphics -Text (U '\uc2dc\uac04\ud45c\u002c\u0020\uc77c\uc815\u002c\u0020\uc88c\uc11d\ubc30\uce58\u002c\u0020\uba54\ubaa8\u002c\u0020\ud559\uc0dd\u0020\uae30\ub85d') -Font $smallFont -Brush $mutedBrush -X 836 -Y 1206 -Width 180 -Height 22
    } finally {
      $tagFont.Dispose()
      $titleFont.Dispose()
      $subtitleFont.Dispose()
      $brandFont.Dispose()
      $captionFont.Dispose()
      $smallFont.Dispose()
      $pageFont.Dispose()
      $whiteBrush.Dispose()
      $mutedBrush.Dispose()
      $softBrush.Dispose()
      $blueBrush.Dispose()
      $amberBrush.Dispose()
    }

    $target = Join-Path $outputDir $card.Filename
    $bmp.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "generated: $target"
  } finally {
    $graphics.Dispose()
    $bmp.Dispose()
  }
}

if ($icon) {
  $icon.Dispose()
}
